#!/usr/bin/env sh
set -eu

# ===== Gemeinsame Vault-Konfig =====
: "${VAULT_ADDR:?missing VAULT_ADDR}"
: "${VAULT_TOKEN:?missing VAULT_TOKEN}"   # Token mit Policy pki-rotate-vault-dev
export VAULT_ADDR VAULT_TOKEN
# mTLS-Defaults für Vault-CLI (überschreibbar via ENV)
export VAULT_CACERT="${VAULT_CACERT:-/vault/rotator-certs/ca.crt}"
export VAULT_CLIENT_CERT="${VAULT_CLIENT_CERT:-/vault/rotator-certs/agent.crt}"
export VAULT_CLIENT_KEY="${VAULT_CLIENT_KEY:-/vault/rotator-certs/agent.key}"

# ===== Rotation 1: Vault-Node (Server-TLS) =====
ROLE="${ROLE:-vault-node-internal}"
CN="${CN:-vault-dev}"
ALT_NAMES="${ALT_NAMES:-vault-dev,localhost}"
IP_SANS="${IP_SANS:-127.0.0.1}"
CERT_DIR="${CERT_DIR:-/vault/certs}"
CRT="$CERT_DIR/vault.crt"
KEY="$CERT_DIR/vault.key"
CA="$CERT_DIR/ca.crt"
NODE_CERT_TTL="${NODE_CERT_TTL:-2160h}"                    # ~90 Tage
ROTATE_BEFORE_SECONDS="${ROTATE_BEFORE_SECONDS:-604800}"   # 7 Tage

rotate_if_needed() {
  dir="$1"; cn="$2"; role="$3"; ttl="$4"; alt="$5"; ips="$6"
  crt="$dir/vault.crt"; key="$dir/vault.key"; ca="$dir/ca.crt"

  need=0
  if [ ! -s "$crt" ]; then
    echo ">> [$cn] no cert -> rotate"
    need=1
  elif ! openssl x509 -checkend "$ROTATE_BEFORE_SECONDS" -noout -in "$crt" >/dev/null 2>&1; then
    echo ">> [$cn] expiring soon -> rotate"
    need=1
  else
    echo ">> [$cn] still valid -> skip"
  fi

  if [ "$need" -eq 1 ]; then
    echo ">> [$cn] issuing new leaf from role=$role"
    ARGSTR="common_name=$cn ttl=$ttl"
    [ -n "$alt" ] && ARGSTR="$ARGSTR alt_names=$alt"
    [ -n "$ips" ] && ARGSTR="$ARGSTR ip_sans=$ips"

    ISSUE="$(vault write -format=json "pki/issue/$role" $ARGSTR)"
    umask 077
    echo "$ISSUE" | jq -r '.data.certificate' > "$dir/.vault.crt.new"
    echo "$ISSUE" | jq -r '.data.private_key' > "$dir/.vault.key.new"
    echo "$ISSUE" | jq -r '.data.issuing_ca'  > "$dir/.ca.crt.new"

    # Vault liest als 100:100
    chown 100:100 "$dir/.vault.crt.new" "$dir/.vault.key.new" "$dir/.ca.crt.new"
    chmod 600 "$dir/.vault.key.new"
    chmod 644 "$dir/.vault.crt.new" "$dir/.ca.crt.new"

    mv -f "$dir/.vault.crt.new" "$crt"
    mv -f "$dir/.vault.key.new" "$key"
    mv -f "$dir/.ca.crt.new"    "$ca"
    return 0
  fi
  return 1
}

echo ">> rotate check (node) for CN=$CN @ $CERT_DIR"
if rotate_if_needed "$CERT_DIR" "$CN" "$ROLE" "$NODE_CERT_TTL" "$ALT_NAMES" "$IP_SANS"; then
  echo ">> node cert replaced; sending HUP to Vault"
  # dank pid: service:<vault-dev> ist Vault hier PID 1
  kill -HUP 1 || pkill -HUP vault || true
fi

# ===== Rotation 2: Rotator-Client (mTLS gegen Vault) =====
CLIENT_ROLE="${CLIENT_ROLE:-clients-internal}"
CLIENT_CN="${CLIENT_CN:-agent-vault-dev-rotator}"
CLIENT_CERT_DIR="${CLIENT_CERT_DIR:-/vault/rotator-certs}"
RCRT="$CLIENT_CERT_DIR/agent.crt"
RKEY="$CLIENT_CERT_DIR/agent.key"
RCA="$CLIENT_CERT_DIR/ca.crt"
CLIENT_TTL="${CLIENT_TTL:-720h}"   # ~30 Tage

echo ">> rotate check (rotator client) for CN=$CLIENT_CN @ $CLIENT_CERT_DIR"
needc=0
if [ ! -s "$RCRT" ]; then
  echo ">> [client] no cert -> rotate"
  needc=1
elif ! openssl x509 -checkend "$ROTATE_BEFORE_SECONDS" -noout -in "$RCRT" >/dev/null 2>&1; then
  echo ">> [client] expiring soon -> rotate"
  needc=1
else
  echo ">> [client] still valid -> skip"
fi

if [ "$needc" -eq 1 ]; then
  echo ">> [client] issuing new client leaf from role=$CLIENT_ROLE"
  CISSUE="$(vault write -format=json "pki/issue/$CLIENT_ROLE" common_name="$CLIENT_CN" ttl="$CLIENT_TTL")"
  umask 077
  echo "$CISSUE" | jq -r '.data.certificate' > "$CLIENT_CERT_DIR/.agent.crt.new"
  echo "$CISSUE" | jq -r '.data.private_key' > "$CLIENT_CERT_DIR/.agent.key.new"
  vault read -field=certificate pki/ca > "$CLIENT_CERT_DIR/.ca.crt.new"

  # Rotator nutzt diese Files selbst; owner 0:0 ist ok, 600/644 reichen
  chmod 600 "$CLIENT_CERT_DIR/.agent.key.new"
  chmod 644 "$CLIENT_CERT_DIR/.agent.crt.new" "$CLIENT_CERT_DIR/.ca.crt.new"

  mv -f "$CLIENT_CERT_DIR/.agent.crt.new" "$RCRT"
  mv -f "$CLIENT_CERT_DIR/.agent.key.new" "$RKEY"
  mv -f "$CLIENT_CERT_DIR/.ca.crt.new"    "$RCA"

  echo ">> [client] replaced mTLS files (no further Vault calls in this run)"
fi

echo "✅ rotation run complete"
