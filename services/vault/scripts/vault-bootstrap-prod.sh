#!/bin/sh
set -eu

# ------- Tools prüfen -------
command -v vault >/dev/null 2>&1 || { echo "vault CLI fehlt"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "jq fehlt"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "curl fehlt"; exit 1; }

# GENERAL CONFIG
VAULT_ADDR="${VAULT_ADDR:-https://vault-1:8200}"
export VAULT_ADDR
export VAULT_SKIP_VERIFY="${VAULT_SKIP_VERIFY:-1}"   # solange self-signed

# VAULT AND VAULT AGENT CERT DIRS
VAULT_1_CERT_DIR="${VAULT_1_CERT_DIR:-/certs/vault-1}"
VAULT_2_CERT_DIR="${VAULT_2_CERT_DIR:-/certs/vault-2}"
VAULT_3_CERT_DIR="${VAULT_3_CERT_DIR:-/certs/vault-3}"
VAULT_AGENT_1_CERT_DIR="${VAULT_AGENT_1_CERT_DIR:-/certs/vault-agent-1}"
VAULT_AGENT_2_CERT_DIR="${VAULT_AGENT_2_CERT_DIR:-/certs/vault-agent-2}"
VAULT_AGENT_3_CERT_DIR="${VAULT_AGENT_3_CERT_DIR:-/certs/vault-agent-3}"

# VAULT SERVICE AGENT CERT DIRS
VAULT_AGENT_API_GATEWAY_CERT_DIR="${VAULT_AGENT_API_GATEWAY_CERT_DIR:-/certs/api-gateway/}"
VAULT_AGENT_API_GATEWAY_APPROLE_DIR="${VAULT_AGENT_API_GATEWAY_APPROLE_DIR:-/approle/api-gateway/}"

VAULT_AGENT_AUTH_USER_SERVICE_CERT_DIR="${VAULT_AGENT_AUTH_USER_SERVICE_CERT_DIR:-/certs/auth-user-service/}"
VAULT_AGENT_AUTH_USER_SERVICE_APPROLE_DIR="${VAULT_AGENT_AUTH_USER_SERVICE_APPROLE_DIR:-/approle/auth-user-service/}"

VAULT_AGENT_GAME_SERVICE_CERT_DIR="${VAULT_AGENT_GAME_SERVICE_CERT_DIR:-/certs/game-service/}"
VAULT_AGENT_GAME_SERVICE_APPROLE_DIR="${VAULT_AGENT_GAME_SERVICE_APPROLE_DIR:-/approle/game-service/}"

VAULT_AGENT_AI_OPPONENT_CERT_DIR="${VAULT_AGENT_AI_OPPONENT_CERT_DIR:-/certs/ai-opponent/}"
VAULT_AGENT_AI_OPPONENT_APPROLE_DIR="${VAULT_AGENT_AI_OPPONENT_APPROLE_DIR:-/approle/ai-opponent/}"

VAULT_AGENT_WEB_APPLICATION_FIREWALL_CERT_DIR="${VAULT_AGENT_WEB_APPLICATION_FIREWALL_CERT_DIR:-/certs/web-application-firewall/}"
VAULT_AGENT_WEB_APPLICATION_FIREWALL_APPROLE_DIR="${VAULT_AGENT_WEB_APPLICATION_FIREWALL_APPROLE_DIR:-/approle/web-application-firewall/}"

VAULT_AGENT_CLI_CERT_DIR="${VAULT_AGENT_CLI_CERT_DIR:-/certs/cli/}"
VAULT_AGENT_CLI_APPROLE_DIR="${VAULT_AGENT_CLI_APPROLE_DIR:-/approle/cli/}"

# VAULT_CONFIG_DIR
VAULT_1_CONFIG_DIR="${VAULT_1_CONFIG_DIR:-/vault/config}"

# VAULT LOGS DIR
VAULT_LOGS_DIR="${VAULT_LOGS_DIR:-/vault/logs}"

# VAULT UNSEAL KEYS DIR
VAULT_KEY_DIR="${VAULT_KEY_DIR:-/vault/keys}"

# VAULT BOOTSTRAP MARKER DIR
VAULT_BOOTSTRAP_STATE_DIR="${VAULT_BOOTSTRAP_STATE_DIR:-/bootstrap-state}"
MARKER_FILE="${MARKER_FILE:-$VAULT_BOOTSTRAP_STATE_DIR/bootstrap_v1.done}"

# VAULT KEY CONFIG
INIT_SHARES="${INIT_SHARES:-1}"
INIT_THRESHOLD="${INIT_THRESHOLD:-1}"

# DOMAINS / CN / ALT NAMES / IP SANS
ROLE_INTERNAL_DOMAINS="${ROLE_INTERNAL_DOMAINS:-vault-1,vault-2,vault-3}"
NODE_CN="${NODE_CN:-vault-1}"
NODE_ALT_NAMES="${NODE_ALT_NAMES:-vault-1}"
NODE_IP_SANS="${NODE_IP_SANS:-127.0.0.1}"

# enable mtls at end of script (default: true)
ENABLE_MTLS_AT_END="${ENABLE_MTLS_AT_END:-true}"

# TRANSIT / JWT CONFIG
TRANSIT_MOUNT="${TRANSIT_MOUNT:-transit}"
JWT_KEY_NAME="${JWT_KEY_NAME:-jwt-issuer}"
JWT_KEY_TYPE="${JWT_KEY_TYPE:-ecdsa-p256}"

# VAULT UID/GID for chown (default: 100=Vault in container, 1000=typical host user)
VAULT_UID="${VAULT_UID:-100}"
VAULT_GID="${VAULT_GID:-100}"

KEYS_JSON="$VAULT_KEY_DIR/keys.json"


vault_host() {
  printf '%s' "$VAULT_ADDR" \
  | sed -E 's#^https?://\[(.+)\](:[0-9]+)?/?#\1#; s#^https?://([^/:]+)(:[0-9]+)?/?#\1#'
}

wait_for_dns() {
  host="${1:-$(vault_host)}"
  echo ">> wait for DNS $host ..."
  for i in $(seq 1 60); do
    if getent hosts "$host" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "!! DNS for $host not found"
  return 2
}

wait_for_vault_api() {
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

wait_for_vault() {
  wait_for_dns || return 1
  wait_for_vault_api || return 2
  return 0
}

init_vault() {
  echo ">> init (shares=$INIT_SHARES threshold=$INIT_THRESHOLD)"
  mkdir -p "$VAULT_KEY_DIR"
  vault operator init -key-shares="$INIT_SHARES" -key-threshold="$INIT_THRESHOLD" -format=json > "$KEYS_JSON"
}

unseal_vault() {
  local keys_needed
  local keys_provided=0
  
  [ -s "$KEYS_JSON" ] || { echo "!! $KEYS_JSON fehlt/leer"; return 1; }

  keys_needed=$(vault status -format=json | jq -r '.t // 1')
  echo ">> need $keys_needed unseal keys"
  
  for i in $(seq 0 $((keys_needed - 1))); do
    UNSEAL_KEY="$(jq -r ".unseal_keys_b64[$i] // empty" "$KEYS_JSON")"
    
    if [ -n "$UNSEAL_KEY" ] && [ "$UNSEAL_KEY" != "null" ]; then
      echo ">> using unseal key $((i + 1))..."
      
      if vault operator unseal "$UNSEAL_KEY"; then
        keys_provided=$((keys_provided + 1))
        echo ">> provided $keys_provided/$keys_needed keys"
        
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

export_vault_token() {
  if [ -n "${VAULT_TOKEN:-}" ] && [ "$VAULT_TOKEN" != "null" ]; then
    echo ">> using VAULT_TOKEN from environment"
    return 0
  fi

  [ -s "$KEYS_JSON" ] || { echo "!! $KEYS_JSON fehlt/leer"; return 1; }

  local t
  if ! t="$(jq -er '.root_token' "$KEYS_JSON" 2>/dev/null)"; then
    echo "!! root_token not found in $KEYS_JSON"
    return 1
  fi
  [ -n "$t" ] && [ "$t" != "null" ] || { echo "!! invalid root_token in $KEYS_JSON"; return 1; }

  export VAULT_TOKEN="$t"
  echo ">> VAULT_TOKEN exported (from keys.json)"
}

enable_jwt_transit() {
  echo ">> ensure $TRANSIT_MOUNT enabled + key $JWT_KEY_NAME ($JWT_KEY_TYPE)"
  # Enable transit if missing
  vault secrets list -format=json | jq -e "has(\"${TRANSIT_MOUNT}/\")" >/dev/null || vault secrets enable -path="$TRANSIT_MOUNT" transit

  # Create key if missing with secure defaults (no private-key export/backup)
  if ! vault read -format=json "$TRANSIT_MOUNT/keys/$JWT_KEY_NAME" >/dev/null 2>&1; then
    vault write "$TRANSIT_MOUNT/keys/$JWT_KEY_NAME" \
      type="$JWT_KEY_TYPE" \
      exportable=false \
      allow_plaintext_backup=false \
      deletion_allowed=false
  else
    # Warn if type mismatches expected (we won't mutate existing key type)
    cur_type="$(vault read -format=json "$TRANSIT_MOUNT/keys/$JWT_KEY_NAME" | jq -r '.data.type // ""')"
    if [ "$cur_type" != "$JWT_KEY_TYPE" ]; then
      echo "!! transit key '$JWT_KEY_NAME' exists with type=$cur_type (expected $JWT_KEY_TYPE). Skipping create."
    fi
  fi
}

enable_pki_engine(){
  echo ">> ensure pki root CA"
  vault secrets list -format=json | jq -e 'has("pki/")' >/dev/null || vault secrets enable pki
  vault secrets tune -max-lease-ttl=87600h pki
  if ! vault read -format=json pki/ca/pem >/dev/null 2>&1; then
    vault write pki/root/generate/internal common_name="Transcendence Internal CA" ttl=87600h >/dev/null
  fi
  vault write pki/config/urls \
    issuing_certificates="$VAULT_ADDR/v1/pki/ca" \
    crl_distribution_points="$VAULT_ADDR/v1/pki/crl" >/dev/null
}


define_pki_roles() {

  echo ">> write pki role vault-node-internal (server+client for Vault nodes)"
  vault write pki/roles/vault-node-internal \
    allowed_domains="vault-1,vault-2,vault-3,localhost" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=true \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=true \
    max_ttl="2160h"

  echo ">> write pki role ft-transcendence (server)"
  vault write pki/roles/ft-transcendence \
    allowed_domains="ft-transcendence.at,localhost" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=false \
    max_ttl="72h"

  echo ">> write pki role api-gateway-internal (server)"
  vault write pki/roles/api-gateway-internal \
    allowed_domains="api-gateway" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=false \
    max_ttl="72h"

  echo ">> write pki role auth-user-service-internal (server)"
  vault write pki/roles/auth-user-service-internal \
    allowed_domains="auth-user-service" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=false \
    max_ttl="72h"

  echo ">> write pki role game-service-internal (server)"
  vault write pki/roles/game-service-internal \
    allowed_domains="game-service" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=false \
    max_ttl="72h"

  # Optional: falls du ai-opponent in Prod nutzt, lass die Rolle aktiv
  echo ">> write pki role ai-opponent-internal (server)"
  vault write pki/roles/ai-opponent-internal \
    allowed_domains="ai-opponent-service" \
    allow_bare_domains=true allow_subdomains=false \
    allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=true client_flag=false \
    max_ttl="72h"

  echo ">> write pki role vault-clients-internal (client mTLS to Vault)"
  vault write pki/roles/vault-clients-internal \
    allowed_domains="api-gateway,auth-user-service,api-gateway-agent,auth-user-service-agent,game-service-agent,web-application-firewall-agent" \
    allow_bare_domains=true allow_subdomains=false allow_ip_sans=false \
    key_type="ec" key_bits=256 \
    server_flag=false client_flag=true \
    max_ttl="720h"
}

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
  chown "$VAULT_UID:$VAULT_GID" "$outdir" "$outdir/$key" "$outdir/$crt" "$outdir/ca.crt" 2>/dev/null || true
}

issue_vault_certs(){
  issue_cert "vault-1"                        "vault-node-internal"     "vault-1,localhost"                    "127.0.0.1"   "$VAULT_1_CERT_DIR"                                "server"
  # issue_cert "vault-1-agent"                  "vault-node-internal"     "vault-1-agent"                        ""            "$VAULT_AGENT_1_CERT_DIR"                          "server"
  issue_cert "vault-2"                        "vault-node-internal"     "vault-2,localhost"                    "127.0.0.1"   "$VAULT_2_CERT_DIR"                                "server"
  # issue_cert "vault-2-agent"                  "vault-node-internal"     "vault-2-agent"                        ""            "$VAULT_AGENT_2_CERT_DIR"                          "server"
  issue_cert "vault-3"                        "vault-node-internal"     "vault-3,localhost"                    "127.0.0.1"   "$VAULT_3_CERT_DIR"                                "server"
  # issue_cert "vault-3-agent"                  "vault-node-internal"     "vault-3-agent"                        ""            "$VAULT_AGENT_3_CERT_DIR"                          "server"
  # issue_cert "api-gateway-agent"              "vault-clients-internal"  "api-gateway-agent"                    ""            "$VAULT_AGENT_API_GATEWAY_CERT_DIR"                "client"
  # issue_cert "auth-user-service-agent"        "vault-clients-internal"  "auth-user-service-agent"              ""            "$VAULT_AGENT_AUTH_USER_SERVICE_CERT_DIR"          "client"
  # issue_cert "game-service-agent"             "vault-clients-internal"  "game-service-agent"                   ""            "$VAULT_AGENT_GAME_SERVICE_CERT_DIR"               "client"
  # issue_cert "web-application-firewall-agent" "vault-clients-internal"  "web-application-firewall-agent"       ""            "$VAULT_AGENT_WEB_APPLICATION_FIREWALL_CERT_DIR"   "client"
}

# ------- Phase 8: Policies & App-Roles -------

enable_policies_and_approles() {
  echo ">> enable policies and approles"
  
  vault auth enable approle 2>/dev/null || true

  vault policy write api-gateway        policies/common/api-gateway.hcl
  vault policy write auth-user-service  policies/common/auth-user-service.hcl
  vault policy write 



  vault write auth/approle/role/api-gateway \
    token_policies="api-gateway" token_ttl="1h" token_max_ttl="4h" secret_id_num_uses=0

  vault write auth/approle/role/auth-user-service \
    token_policies="auth-user-service" token_ttl="1h" token_max_ttl="4h" secret_id_num_uses=0

  mkdir -p /certs/api-gateway/approle /certs/auth-user-service/approle
  chown 
  umask 077

  vault read  -field=role_id  auth/approle/role/api-gateway/role-id            > /certs/api-gateway/approle/role_id
  vault write -f -format=json auth/approle/role/api-gateway/secret-id | jq -r '.data.secret_id' > /certs/api-gateway/approle/secret_id
  chmod 600 /certs/api-gateway/approle/role_id /certs/api-gateway/approle/secret_id
  chown "${VAULT_UID:-0}:${VAULT_GID:-0}" /certs/api-gateway/approle/* 2>/dev/null || true

  vault read  -field=role_id  auth/approle/role/auth-user-service/role-id      > /certs/auth-user-service/approle/role_id
  vault write -f -format=json auth/approle/role/auth-user-service/secret-id | jq -r '.data.secret_id' > /certs/auth-user-service/approle/secret_id
  chmod 600 /certs/auth-user-service/approle/role_id /certs/auth-user-service/approle/secret_id
  chown "${VAULT_UID:-0}:${VAULT_GID:-0}" /certs/auth-user-service/approle/* 2>/dev/null || true
}

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


wait_for_vault || { echo "!! vault not reachable"; exit 1; }

# CALL 1
if ! vault status -format=json | jq -e '.initialized == true' >/dev/null; then
 init_vault || { echo "!! vault init failed"; exit 1; }
fi

# CALL 2
if ! vault status -format=json | jq -e '.sealed == false' >/dev/null; then
  unseal_vault || exit 1
fi

# CALL 3
export_vault_token

# CALL 5
enable_jwt_transit

# CALL 6
enable_pki_engine
define_pki_roles
issue_vault_certs

# CALL 7
enable_policies_and_approles

# MARKER setzen
date -Iseconds > "$MARKER_FILE"
echo ">> bootstrap done."
