#!/bin/sh
set -euo pipefail

# VAULT UNSEAL KEYS DIR
VAULT_KEY_DIR="${VAULT_KEY_DIR:-/vault/keys}"

# TLS trust / mTLS for talking to Vault
VAULT_CACERT="${VAULT_CACERT:-/vault/certs/ca.crt}"
# Optional: if mTLS is required by Vault listener, you can provide client cert/key via env or defaults
VAULT_CLIENT_CERT="${VAULT_CLIENT_CERT:-/vault/certs/server.crt}"
VAULT_CLIENT_KEY="${VAULT_CLIENT_KEY:-/vault/certs/server.key}"

# Validate CA cert presence (fail fast)
if [ ! -f "$VAULT_CACERT" ]; then
  echo "!! CA cert not found at $VAULT_CACERT"
  ls -l /vault/certs 2>/dev/null || true
  exit 3
fi

# Export for vault CLI
export VAULT_CACERT

# Export client certs only if both exist (avoid breaking when not needed)
if [ -f "$VAULT_CLIENT_CERT" ] && [ -f "$VAULT_CLIENT_KEY" ]; then
  export VAULT_CLIENT_CERT VAULT_CLIENT_KEY
fi

# Path to keys.json (from bootstrap)
KEYS_JSON="${KEYS_JSON:-$VAULT_KEY_DIR/keys.json}"
export VAULT_ADDR="${VAULT_ADDR:-https://vault-1:8200}"

echo ">> wait for DNS vault-1 ..."
for i in $(seq 1 60); do
  getent hosts vault-1 >/dev/null 2>&1 && ok=1 && break
  sleep 1
done
[ "${ok:-0}" = "1" ] || { echo "!! DNS for vault-1 not found"; exit 2; }

unseal_vault() {
  local keys_needed
  local keys_provided=0
  
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

if ! vault status -format=json | jq -e '.sealed == false' >/dev/null; then
  unseal_vault || exit 1
fi