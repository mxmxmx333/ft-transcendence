#!/bin/sh
set -eu

# ------- Tools prüfen -------
command -v vault >/dev/null 2>&1 || { echo "vault CLI fehlt"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "jq fehlt"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "curl fehlt"; exit 1; }

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

# Domains/Rolle für dev (weit gefasst, ggf. anpassen)
ROLE_INTERNAL_DOMAINS="${ROLE_INTERNAL_DOMAINS:-vault-dev,api-gateway,auth-user-service,game-service,localhost,ai-opponent}"
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
if ! vault status -format=json | jq -e '.initialized == true' >/dev/null; then
  echo ">> init (shares=$INIT_SHARES threshold=$INIT_THRESHOLD)"
  mkdir -p "$VAULT_LOGS_DIR"
  vault operator init -key-shares="$INIT_SHARES" -key-threshold="$INIT_THRESHOLD" -format=json > "$KEYS_JSON"
fi

# ------- Phase 2: unseal (falls nötig) -------
if ! vault status -format=json | jq -e '.sealed == false' >/dev/null; then
  echo ">> unseal"
  UNSEAL_KEY="$(jq -r '.unseal_keys_b64[0]' "$KEYS_JSON")"
  [ -n "$UNSEAL_KEY" ] || { echo "!! no unseal key in $KEYS_JSON"; exit 1; }
  vault operator unseal "$UNSEAL_KEY"
fi

# ------- Phase 3: login (Root-Token nur für Bootstrap) -------
export VAULT_TOKEN="$(jq -r '.root_token' "$KEYS_JSON")"
[ -n "$VAULT_TOKEN" ] || { echo "!! no root token in $KEYS_JSON"; exit 1; }

# ------- Idempotenz: Marker? -------
if [ -f "$MARKER_FILE" ]; then
  echo ">> already bootstrapped ($MARKER_FILE)"; exit 0
fi

# ------- Phase 4: Audit (falls nicht via HCL) -------
if ! vault audit list -format=json | jq -e 'has("file/")' >/dev/null; then
  echo ">> enable audit:file"
  vault audit enable file file_path="$VAULT_LOGS_DIR/audit.json" mode=0640 log_raw=false
fi

# ------- Phase 5: Transit (JWT) -------
echo ">> ensure transit + jwt-issuer"
vault secrets list -format=json | jq -e 'has("transit/")' >/dev/null || vault secrets enable transit # prüfen ob transit schon aktiv ist
vault read transit/keys/jwt-issuer >/dev/null 2>&1 || vault write -f transit/keys/jwt-issuer type=ecdsa-p256 # prüfen ob key vorhanden, wenn nicht anlegen

# ------- Policies -------
vault policy write auth-service /policies/auth-service.hcl
vault policy write api-gateway   /policies/api-gateway.hcl
vault policy write pki-agent-api-gateway /policies/pki-agent-api-gateway.hcl
vault policy write pki-agent-auth-user-service /policies/pki-agent-auth-user-service.hcl
vault policy write pki-agent-game-service /policies/pki-agent-game-service.hcl
vault policy write pki-agent-ai-opponent /policies/pki-agent-ai-opponent.hcl
vault policy write pki-agent-vault-dev /policies/pki-agent-vault-dev.hcl
vault policy write pki-agent-web-application-firewall /policies/pki-agent-web-application-firewall.hcl
vault policy write pki-rotate-node-certs /policies/pki-rotate-node-certs.hcl

# ------- Phase 6: PKI(Public Key Infrastructure) (interne Root-CA für dev) -------
echo ">> ensure pki root CA"
vault secrets list -format=json | jq -e 'has("pki/")' >/dev/null || vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki
if ! vault read -format=json pki/ca/pem >/dev/null 2>&1; then
  vault write pki/root/generate/internal common_name="Transcendence Internal CA" ttl=87600h >/dev/null
fi
vault write pki/config/urls \
  issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
  crl_distribution_points="$VAULT_ADDR/v1/pki/crl" >/dev/null

# ------- Phase 7: Rollen (intern) -------

echo ">> write pki role node-internal"

vault write pki/roles/vault-node-internal \
  allowed_domains="vault-dev,vault-1,vault-2,vault-3,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=true \
  max_ttl="2160h"

echo ">> write pki role internal-services"
vault write pki/roles/api-gateway-internal \
  allowed_domains="api-gateway" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/auth-user-internal \
  allowed_domains="auth-user-service" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/game-service-internal \
  allowed_domains="game-service" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/ai-opponent-internal \
  allowed_domains="ai-opponent-service" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/waf \
  allowed_domains="ft-transcendence.at" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="720h"

vault write pki/roles/web-application-firewall-client \
  allowed_domains="web-application-firewall" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=false client_flag=true \
  max_ttl="720h"

echo ">> write pki role agents-internal"
vault write pki/roles/agents-internal \
  allowed_domains="vault-dev-rotator,agent-api-gateway,agent-auth-user-service,agent-game-service,agent-ai-opponent" \
  allow_bare_domains=true allow_subdomains=false \
  key_type="ec" key_bits=256 \
  server_flag=false client_flag=true \
  max_ttl="720h"

# ------- Phase 8: Node-Zertifikate ausstellen -------
echo ">> issue node cert for $NODE_CN"
ISSUE="$(vault write -format=json pki/issue/internal-servers \
  common_name="$NODE_CN" alt_names="$NODE_ALT_NAMES" ip_sans="$NODE_IP_SANS")"

mkdir -p "$VAULT_CERT_DIR"
echo "$ISSUE" | jq -r '.data.certificate'  > "$VAULT_CERT_DIR/$NODE_CN.crt"
echo "$ISSUE" | jq -r '.data.private_key'  > "$VAULT_CERT_DIR/$NODE_CN.key"
echo "$ISSUE" | jq -r '.data.issuing_ca'   > "$VAULT_CERT_DIR/ca.crt"

chmod 600 "$VAULT_CERT_DIR/$NODE_CN.key"
chmod 644 "$VAULT_CERT_DIR/$NODE_CN.crt" "$VAULT_CERT_DIR/ca.crt"

ROT_TLS_DIR="/vault/rotator-tls"      # dieses Verzeichnis muss der Bootstrap-Container rw gemountet haben
mkdir -p "$ROT_TLS_DIR"; umask 077

# Client-Zert für den Rotator ausstellen
RISSUE="$(vault write -format=json pki/issue/clients-internal common_name='agent-vault-dev-rotator' ttl='720h')"
echo "$RISSUE" | jq -r '.data.certificate' > "$ROT_TLS_DIR/agent.crt"
echo "$RISSUE" | jq -r '.data.private_key' > "$ROT_TLS_DIR/agent.key"
vault read -field=certificate pki/ca      > "$ROT_TLS_DIR/ca.crt"

# Rechte/Owner (Vault-User 100:100 reicht hier ebenfalls, ro im Rotator)
chown 100:100 "$ROT_TLS_DIR/"*
chmod 600 "$ROT_TLS_DIR/agent.key"
chmod 644 "$ROT_TLS_DIR/agent.crt" "$ROT_TLS_DIR/ca.crt"


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
