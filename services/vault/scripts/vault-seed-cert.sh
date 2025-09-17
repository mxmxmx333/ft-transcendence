#!/bin/sh
set -eu

# --- Certs ---
if ! command -v openssl >/dev/null 2>&1; then apk add --no-cache openssl >/dev/null; fi

CN="vault-dev"
CERT_DST="/certs"
CONF_SRC="/source-config"   # deine HCL-Dateien aus dem Repo (ro)
CONF_DST="/config"          # named volume für Vault-Config

# Certs idempotent erzeugen (nur wenn noch nicht vorhanden)
if [ ! -f "$CERT_DST/$CN.crt" ] || [ ! -f "$CERT_DST/$CN.key" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 7 \
    -subj "/CN=$CN" \
    -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1" \
    -keyout "$CERT_DST/$CN.key" \
    -out    "$CERT_DST/$CN.crt"
  cp "$CERT_DST/$CN.crt" "$CERT_DST/ca.crt"
  chown 100:100 "$CERT_DST/$CN.crt" "$CERT_DST/$CN.key" "$CERT_DST/ca.crt" || true
  chmod 0644 "$CERT_DST/$CN.crt" "$CERT_DST/ca.crt"
  chmod 0600 "$CERT_DST/$CN.key"
  echo "✅ seeded certs to $CERT_DST"
else
  echo "↩︎ certs already exist, skip"
fi

# --- Config seeden (RO im Repo → RW in Volume), idempotent ---
# Wir nehmen einen ganzen Ordner (z.B. services/vault/config/dev/) und kopieren ihn genau einmal
if [ -n "$(ls -A "$CONF_DST" 2>/dev/null || true)" ]; then
  echo "↩︎ config already present, skip"
else
  cp -a "$CONF_SRC"/. "$CONF_DST"/
  chown -R 100:100 "$CONF_DST" || true
  find "$CONF_DST" -type f -name '*.hcl' -exec chmod 0644 {} \;
  echo "✅ seeded config to $CONF_DST"
fi
