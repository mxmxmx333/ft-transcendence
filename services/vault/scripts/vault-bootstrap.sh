#!/bin/sh
set -eu

# ------- Konfig (per ENV überschreibbar) -------
VAULT_ADDR="${VAULT_ADDR:-https://vault-dev:8200}"
export VAULT_ADDR
export VAULT_SKIP_VERIFY="${VAULT_SKIP_VERIFY:-1}"   # solange self-signed
VAULT_CERT_DIR="${VAULT_CERT_DIR:-/vault/certs}"
VAULT_CONFIG_DIR="${VAULT_CONFIG_DIR:-/vault/config}"
VAULT_LOGS_DIR="${VAULT_LOGS_DIR:-/vault/logs}"
MARKER_FILE="${MARKER_FILE:-$VAULT_LOGS_DIR/bootstrap_v1.done}"

INIT_SHARES="${INIT_SHARES:-1}"
INIT_THRESHOLD="${INIT_THRESHOLD:-1}"

# Domains/Rolle für dev (intern weit gefasst, passe nach Bedarf an)
ROLE_INTERNAL_DOMAINS="${ROLE_INTERNAL_DOMAINS:-vault-dev,api-gateway,auth-user-service,game-service,localhost}"
NODE_CN="${NODE_CN:-vault-dev}"
NODE_ALT_NAMES="${NODE_ALT_NAMES:-localhost}"
NODE_IP_SANS="${NODE_IP_SANS:-127.0.0.1}"

# mTLS am Ende automatisch zuschalten? (true/false)
ENABLE_MTLS_AT_END="${ENABLE_MTLS_AT_END:-false}"

KEYS_JSON="$VAULT_LOGS_DIR/keys.json"

# ------- Phase 0: warten bis HTTP bereit -------
echo ">> wait for Vault at $VAULT_ADDR ..."
i=0
until curl -fsS "$VAULT_ADDR/v1/sys/health?standbyok=true&sealedcode=204" >/dev/null 2>&1 || [ $i -gt 90 ]; do
  i=$((i+1)); sleep 1
done

# ------- Phase 1: init (einmalig) -------
if ! vault status -format=json | grep -q '"initialized": true'; then
  echo ">> init (shares=$INIT_SHARES threshold=$INIT_THRESHOLD)"
  mkdir -p "$VAULT_LOGS_DIR"
  vault operator init -key-shares="$INIT_SHARES" -key-threshold="$INIT_THRESHOLD" -format=json > "$KEYS_JSON"
fi

# ------- Phase 2: unseal (falls nötig) -------
if ! vault status -format=json | grep -q '"sealed": false'; then
  echo ">> unseal"
  UNSEAL_KEY="$(sed -n 's/.*"unseal_keys_b64":\s*\[\s*"\([^"]*\)".*/\1/p' "$KEYS_JSON")"
  [ -n "$UNSEAL_KEY" ] || { echo "!! no unseal key in $KEYS_JSON"; exit 1; }
  vault operator unseal "$UNSEAL_KEY"
fi

# ------- Phase 3: login (Root-Token nur für Bootstrap) -------
export VAULT_TOKEN="$(sed -n 's/.*"root_token":"\([^"]*\)".*/\1/p' "$KEYS_JSON")"
[ -n "$VAULT_TOKEN" ] || { echo "!! no root token in $KEYS_JSON"; exit 1; }

# ------- Idempotenz: Marker? -------
if [ -f "$MARKER_FILE" ]; then
  echo ">> already bootstrapped ($MARKER_FILE)"; exit 0
fi

# ------- Phase 4: Audit (falls nicht via HCL) -------
if ! vault audit list -format=json | grep -q '"file/"'; then
  echo ">> enable audit:file"
  vault audit enable file file_path="$VAULT_LOGS_DIR/audit.json" mode=0640 log_raw=false
fi

# ------- Phase 5: Transit (JWT) -------
echo ">> ensure transit + jwt-issuer"
vault secrets list -format=json | grep -q '"transit/"' || vault secrets enable transit
vault read transit/keys/jwt-issuer >/dev/null 2>&1 || vault write -f transit/keys/jwt-issuer type=ecdsa-p256

cat >/tmp/auth-service.hcl <<'POL'
path "transit/sign/jwt-issuer"   { capabilities = ["update"] }
path "transit/verify/jwt-issuer" { capabilities = ["update"] }
path "transit/keys/jwt-issuer"   { capabilities = ["read"] }
POL
vault policy write auth-service /tmp/auth-service.hcl

# ------- Phase 6: PKI (interne Root-CA für dev) -------
echo ">> ensure pki root CA"
vault secrets list -format=json | grep -q '"pki/"' || vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki
vault read pki/ca/pem >/dev/null 2>&1 || \
  vault write pki/root/generate/internal common_name="Transcendence Internal CA" ttl=87600h
vault write pki/config/urls \
  issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
  crl_distribution_points="$VAULT_ADDR/v1/pki/crl"

# ------- Phase 7: Rollen (intern) -------
echo ">> write pki role internal-servers"
vault write pki/roles/internal-servers \
  allowed_domains="$ROLE_INTERNAL_DOMAINS" \
  allow_bare_domains=true \
  allow_subdomains=false \
  allow_ip_sans=true \
  server_flag=true \
  max_ttl="72h"

# ------- Phase 8: Node-Zert für vault-dev ausstellen -------
echo ">> issue node cert for $NODE_CN"
ISSUE="$(vault write -format=json pki/issue/internal-servers \
  common_name="$NODE_CN" alt_names="$NODE_ALT_NAMES" ip_sans="$NODE_IP_SANS")"

mkdir -p "$VAULT_CERT_DIR"
printf '%s\n' "$(echo "$ISSUE" | sed -n 's/.*"certificate":"\([^"]*\)".*/\1/p' | sed 's/\\n/\n/g')" > "$VAULT_CERT_DIR/$NODE_CN.crt"
printf '%s\n' "$(echo "$ISSUE" | sed -n 's/.*"private_key":"\([^"]*\)".*/\1/p' | sed 's/\\n/\n/g')" > "$VAULT_CERT_DIR/$NODE_CN.key"
vault read -field=certificate pki/ca > "$VAULT_CERT_DIR/ca.crt"

chmod 600 "$VAULT_CERT_DIR/$NODE_CN.key"
chmod 644 "$VAULT_CERT_DIR/$NODE_CN.crt" "$VAULT_CERT_DIR/ca.crt"

# ------- Phase 9: (optional) mTLS per Zusatz-HCL aktivieren -------
if [ "$ENABLE_MTLS_AT_END" = "true" ]; then
  echo ">> enable mTLS via extra HCL"
  cat > "$VAULT_CONFIG_DIR/10-mtls.hcl" <<'HCL'
listener "tcp" {
  tls_client_ca_file                 = "/vault/certs/ca.crt"
  tls_require_and_verify_client_cert = true
}
HCL
  chmod 0644 "$VAULT_CONFIG_DIR/10-mtls.hcl"
  echo ">> send SIGHUP to vault-dev to reload certs/configs"
fi

date -Iseconds > "$MARKER_FILE"
echo ">> bootstrap done."
