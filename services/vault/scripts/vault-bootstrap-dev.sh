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
VAULT_CERT_DIR="${VAULT_CERT_DIR:-/certs/vault-dev}"
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

AUTH_USER_APPROLE_DIR="${AUTH_USER_APPROLE_DIR:-/approle/auth-user-service}"
API_GATEWAY_APPROLE_DIR="${API_GATEWAY_APPROLE_DIR:-/approle/api-gateway}"
# mTLS am Ende automatisch zuschalten? (true/false)
ENABLE_MTLS_AT_END="${ENABLE_MTLS_AT_END:-false}"

KEYS_JSON="$VAULT_LOGS_DIR/keys.json"
HOST_GID="${HOST_GID:-1000}"
HOST_UID="${HOST_UID:-1000}"

# ------- Phase 0: warten bis HTTP bereit -------
echo ">> wait for DNS vault-dev ..."
for i in $(seq 1 60); do
  getent hosts vault-dev >/dev/null 2>&1 && ok=1 && break
  sleep 1
done
[ "${ok:-0}" = "1" ] || { echo "!! DNS for vault-dev not found"; exit 2; }

wait_for_vault_api() {
  # Akzeptiere Health-Codes, die bedeuten „Vault läuft, Zustand egal“
  local ok_codes="200 429 501 503"
  echo ">> wait for Vault API at $VAULT_ADDR ..."
  for i in $(seq 1 60); do
    code="$(curl -sk -o /dev/null -w '%{http_code}' "$VAULT_ADDR/v1/sys/health" || true)"
    for c in $ok_codes; do
      [ "$code" = "$c" ] && echo ">> API up (HTTP $code)" && return 0
    done
    sleep 1
  done
  echo "!! Vault API not reachable at $VAULT_ADDR"
  return 3
}

wait_for_vault_api || exit 3

# ------- Phase 1: init (einmalig) -------
if ! vault status -format=json | jq -e '.initialized == true' >/dev/null; then
  echo ">> init (shares=$INIT_SHARES threshold=$INIT_THRESHOLD)"
  mkdir -p "$VAULT_LOGS_DIR"
  vault operator init -key-shares="$INIT_SHARES" -key-threshold="$INIT_THRESHOLD" -format=json > "$KEYS_JSON"
fi

# ------- Phase 2: unseal (falls nötig) -------
# Verbesserte Unseal-Logik für mehrere Shares
unseal_vault() {
  local keys_needed
  local keys_provided=0
  
  # Wie viele Keys brauchen wir?
  keys_needed=$(vault status -format=json | jq -r '.t // 1')
  echo ">> need $keys_needed unseal keys"
  
  # Alle verfügbaren Keys probieren
  for i in $(seq 0 $((keys_needed - 1))); do
    UNSEAL_KEY="$(jq -r ".unseal_keys_b64[$i] // empty" "$KEYS_JSON")"
    
    if [ -n "$UNSEAL_KEY" ] && [ "$UNSEAL_KEY" != "null" ]; then
      echo ">> using unseal key $((i + 1))..."
      
      if vault operator unseal "$UNSEAL_KEY"; then
        keys_provided=$((keys_provided + 1))
        echo ">> provided $keys_provided/$keys_needed keys"
        
        # Prüfe ob schon genug
        if vault status -format=json | jq -e '.sealed == false' >/dev/null; then
          echo "✅ vault unsealed successfully"
          return 0
        fi
      else
        echo "❌ failed to apply unseal key $((i + 1))"
      fi
    fi
  done
  
  echo "❌ could not unseal vault with available keys"
  return 1
}

if ! vault status -format=json | jq -e '.sealed == false' >/dev/null; then
  unseal_vault || exit 1
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

# ------- Phase 7: PKI Rollen und Zertifikate -------

echo ">> write pki role node-internal"
vault write pki/roles/vault-node-internal \
  allowed_domains="vault-dev,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=true \
  max_ttl="2160h"

echo ">> write pki role internal-services"
vault write pki/roles/api-gateway-internal \
  allowed_domains="api-gateway,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/auth-user-internal \
  allowed_domains="auth-user-service,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/game-service-internal \
  allowed_domains="game-service,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/ai-opponent-internal \
  allowed_domains="ai-opponent-service,localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/vite-internal \
  allowed_domains="localhost" \
  allow_bare_domains=true allow_subdomains=false \
  allow_ip_sans=true \
  key_type="ec" key_bits=256 \
  server_flag=true client_flag=false \
  max_ttl="72h"

vault write pki/roles/vault-clients-internal \
  allowed_domains="api-gateway,auth-user-service" \
  allow_bare_domains=true allow_subdomains=false allow_ip_sans=false \
  key_type="ec" key_bits=256 \
  server_flag=false client_flag=true \
  max_ttl="720h"

issue_cert() {
  cn="$1"; role="$2"; alt="$3"; ips="$4"; outdir="$5"; kind="${6:-server}"
  [ -n "$cn" ] && [ -n "$role" ] && [ -n "$outdir" ] || { echo "!! missing param"; exit 1; }
  case "$kind" in
    server) key="server.key"; crt="server.crt" ;;
    client) key="client.key"; crt="client.crt" ;;
    *) echo "!! unknown kind: $kind"; exit 1 ;;
  esac
  echo ">> issue cert for $cn (role=$role, kind=$kind) -> $outdir"
  umask 077
  mkdir -p "$outdir"
  chmod 700 "$outdir" || true
  ISSUE="$(vault write -format=json "pki/issue/$role" common_name="$cn" alt_names="$alt" ip_sans="$ips" ttl="720h")"
  printf '%s' "$ISSUE" | jq -r '.data.private_key' > "$outdir/$key"
  printf '%s' "$ISSUE" | jq -r '.data.certificate' > "$outdir/$crt"
  printf '%s' "$ISSUE" | jq -r '.data.issuing_ca'  > "$outdir/ca.crt"
  chmod 600 "$outdir/$key"
  chmod 644 "$outdir/$crt" "$outdir/ca.crt"
  chown "$HOST_UID:$HOST_GID" "$outdir" "$outdir/$key" "$outdir/$crt" "$outdir/ca.crt" 2>/dev/null || true
}

issue_cert "vault-dev"          "vault-node-internal"     "vault-dev,localhost" "127.0.0.1"   "$VAULT_CERT_DIR"                "server"
issue_cert "localhost"          "api-gateway-internal"    "localhost"           "127.0.0.1"   "/certs/api-gateway"             "server"
issue_cert "localhost"          "auth-user-internal"      "localhost"           "127.0.0.1"   "/certs/auth-user-service"       "server"
issue_cert "localhost"          "game-service-internal"   "localhost"           "127.0.0.1"   "/certs/game-service"            "server"
issue_cert "localhost"          "ai-opponent-internal"    "localhost"           "127.0.0.1"   "/certs/ai-opponent"             "server"
issue_cert "localhost"          "vite-internal"           "localhost"           "127.0.0.1"   "/certs/vite"                    "server"
issue_cert "api-gateway"        "vault-clients-internal"  ""                    ""            "/certs/api-gateway/vault"       "client"
issue_cert "auth-user-service"  "vault-clients-internal"  ""                    ""            "/certs/auth-user-service/vault" "client"

# ------- Phase 8: Policies & App-Roles -------

vault auth enable approle 2>/dev/null || true

vault policy write api-gateway   policies/api-gateway.hcl
vault policy write auth-user-service  policies/auth-user-service.hcl

vault write auth/approle/role/api-gateway \
  token_policies="api-gateway" token_ttl="1h" token_max_ttl="4h" secret_id_num_uses=0

vault write auth/approle/role/auth-user-service \
  token_policies="auth-user-service" token_ttl="1h" token_max_ttl="4h" secret_id_num_uses=0

mkdir -p "$AUTH_USER_APPROLE_DIR" "$API_GATEWAY_APPROLE_DIR"
chown "${HOST_UID:-0}:${HOST_GID:-0}" "$AUTH_USER_APPROLE_DIR" "$API_GATEWAY_APPROLE_DIR" 2>/dev/null || true

vault read  -field=role_id  auth/approle/role/api-gateway/role-id            > ${API_GATEWAY_APPROLE_DIR}/role_id
vault write -f -format=json auth/approle/role/api-gateway/secret-id | jq -r '.data.secret_id' > ${API_GATEWAY_APPROLE_DIR}/secret_id
chmod 600 ${API_GATEWAY_APPROLE_DIR}/role_id ${API_GATEWAY_APPROLE_DIR}/secret_id
chown "${HOST_UID:-0}:${HOST_GID:-0}" ${API_GATEWAY_APPROLE_DIR}/* 2>/dev/null || true

vault read  -field=role_id  auth/approle/role/auth-user-service/role-id      > ${AUTH_USER_APPROLE_DIR}/role_id
vault write -f -format=json auth/approle/role/auth-user-service/secret-id | jq -r '.data.secret_id' > ${AUTH_USER_APPROLE_DIR}/secret_id
chmod 600 ${AUTH_USER_APPROLE_DIR}/role_id ${AUTH_USER_APPROLE_DIR}/secret_id
chown "${HOST_UID:-0}:${HOST_GID:-0}" ${AUTH_USER_APPROLE_DIR}/* 2>/dev/null || true


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

