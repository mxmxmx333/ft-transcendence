#!/bin/sh
set -eu

# --- Certs ---
if ! command -v openssl >/dev/null 2>&1; then apk add --no-cache openssl >/dev/null; fi

CN="vault-dev"
CERT_DST=${DEST:-/destination}   # named volume für Vault-Certs
CERT_NAME="server"

# Certs idempotent erzeugen (nur wenn noch nicht vorhanden)
if [ ! -f "$CERT_DST/$CERT_NAME.crt" ] || [ ! -f "$CERT_DST/$CERT_NAME.key" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 7 \
    -subj "/CN=$CN" \
    -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DST/$CERT_NAME.key" \
    -out    "$CERT_DST/$CERT_NAME.crt"
  cp "$CERT_DST/$CERT_NAME.crt" "$CERT_DST/ca.crt"
  chown 100:100 "$CERT_DST/$CERT_NAME.crt" "$CERT_DST/$CERT_NAME.key" "$CERT_DST/ca.crt" || true
  chmod 0644 "$CERT_DST/$CERT_NAME.crt" "$CERT_DST/ca.crt"
  chmod 0600 "$CERT_DST/$CERT_NAME.key"
  echo "✅ seeded certs to $CERT_DST"
else
  echo "↩︎ certs already exist, skip"
fi
