#!/bin/sh
set -euo pipefail

# VAULT UNSEAL KEYS DIR
VAULT_KEY_DIR="${VAULT_KEY_DIR:-/vault/keys}"

echo ">> wait for DNS vault-dev ..."
for i in $(seq 1 60); do
  getent hosts vault-dev >/dev/null 2>&1 && ok=1 && break
  sleep 1
done
[ "${ok:-0}" = "1" ] || { echo "!! DNS for vault-dev not found"; exit 2; }

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