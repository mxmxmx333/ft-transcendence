#!/bin/sh
set -euo pipefail

# Idempotent self-signed cert seeder for DEV/PROD
# Controls via ENV (all optional):
#   CN            – common name (default: vault-dev / override per service)
#   EXTRASAN      – extra SAN entries, prefixed with a comma, e.g. ",DNS:localhost,IP:127.0.0.1"
#   DAYS          – validity in days (default: 7)
#   DEST          – output directory (default: /destination)
#   CERT_NAME     – filename stem (server -> server.crt|key) (default: server)
#   KEY_TYPE      – rsa|ec (default: rsa)
#   RSA_BITS      – RSA key size (default: 2048)
#   EC_CURVE      – EC curve name (default: prime256v1)
#   HOST_UID/GID  – chown target for files (default: 100:100)

# --- openssl present? (Alpine)
if ! command -v openssl >/dev/null 2>&1; then
  if command -v apk >/dev/null 2>&1; then apk add --no-cache openssl >/dev/null; fi
fi

CN="${CN:-vault-dev}"
DEST="${DEST:-/destination}"
CERT_NAME="${CERT_NAME:-server}"
DAYS="${DAYS:-7}"
EXTRASAN="${EXTRASAN:-,DNS:localhost,IP:127.0.0.1}"
KEY_TYPE="${KEY_TYPE:-rsa}"
RSA_BITS="${RSA_BITS:-2048}"
EC_CURVE="${EC_CURVE:-prime256v1}"
HOST_UID="${HOST_UID:-100}"
HOST_GID="${HOST_GID:-100}"

# Build SAN string: always include CN as DNS, then any extras (if provided)
SAN="DNS:${CN}${EXTRASAN}"

CRT="$DEST/$CERT_NAME.crt"
KEY="$DEST/$CERT_NAME.key"
CA="$DEST/ca.crt"

mkdir -p "$DEST"

# Create only if one of the files is missing/empty
if [ ! -s "$CRT" ] || [ ! -s "$KEY" ]; then
  umask 077
  if [ "$KEY_TYPE" = "ec" ]; then
    # Generate EC key + self-signed cert
    openssl ecparam -name "$EC_CURVE" -genkey -noout -out "$KEY"
    openssl req -x509 -new -key "$KEY" -sha256 -days "$DAYS" \
      -subj "/CN=$CN" \
      -addext "subjectAltName=$SAN" \
      -out "$CRT"
  else
    # Default to RSA for widest compatibility
    openssl req -x509 -newkey rsa:$RSA_BITS -nodes -sha256 -days "$DAYS" \
      -subj "/CN=$CN" \
      -addext "subjectAltName=$SAN" \
      -keyout "$KEY" \
      -out    "$CRT"
  fi

  # For bootstrap only: use leaf as CA (self-signed), Vault Agent will replace later
  cp "$CRT" "$CA"

  # Ownership & perms (Vault/Agent typically run as uid/gid 100)
  chown "$HOST_UID:$HOST_GID" "$CRT" "$KEY" "$CA" 2>/dev/null || true
  chmod 0644 "$CRT" "$CA"
  chmod 0600 "$KEY"

  echo "✅ seeded certs for CN=$CN into $DEST ($CERT_NAME.{crt,key}, ca.crt)"
else
  echo "↩︎ certs already exist in $DEST, skipping (CN=$CN)"
fi

