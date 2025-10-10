

#!/bin/sh
set -eu

# Configure via environment variables (whitespace-separated lists)
# Example:
#   CERT_DIRS="/waf/service-certs /waf/agent-certs /shared/agent-ca"
#   APPROLE_DIRS="/waf/approle /apigw/approle-agent /apigw/approle-service"
APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"
CERT_DIRS="${CERT_DIRS:-}"
APPROLE_DIRS="${APPROLE_DIRS:-}"
EXTRA_DIRS="${EXTRA_DIRS:-}"
RAFT_DIRS="${RAFT_DIRS:-}"
LOG_DIRS="${LOG_DIRS:-}"

fix_certs_dir() {
  d="$1"
  [ -n "$d" ] || return 0
  [ "$d" = "/" ] && { echo "!! refusing to chown /"; exit 1; }
  mkdir -p "$d"
  chown "$APP_UID:$APP_GID" "$d"
  chmod 0755 "$d"
}

fix_approle_dir() {
  d="$1"
  [ -n "$d" ] || return 0
  [ "$d" = "/" ] && { echo "!! refusing to chown /"; exit 1; }
  mkdir -p "$d"
  chown "$APP_UID:$APP_GID" "$d"
  chmod 0700 "$d"
}

fix_extra_dir() {
  d="$1"
  [ -n "$d" ] || return 0
  [ "$d" = "/" ] && { echo "!! refusing to chown /"; exit 1; }
  mkdir -p "$d"
  chown "$APP_UID:$APP_GID" "$d"
  chmod 0755 "$d"
}

fix_raft_dir() {
  d="$1"
  [ -n "$d" ] || return 0
  [ "$d" = "/" ] && { echo "!! refusing to chown /"; exit 1; }
  mkdir -p "$d"
  chown "$APP_UID:$APP_GID" "$d"
  chmod 0700 "$d"
}

fix_log_dir() {
  d="$1"
  [ -n "$d" ] || return 0
  [ "$d" = "/" ] && { echo "!! refusing to chown /"; exit 1; }
  mkdir -p "$d"
  chown "$APP_UID:$APP_GID" "$d"
  chmod 0750 "$d"
}

echo ">> Preparing volumes (ownership ${APP_UID}:${APP_GID})…"

# CERT directories
for d in $CERT_DIRS; do
  echo "  - certs: $d"
  fix_certs_dir "$d"
done

# AppRole directories (contain role_id/secret_id)
for d in $APPROLE_DIRS; do
  echo "  - approle: $d"
  fix_approle_dir "$d"
done

# Raft data directories (should be strict 0700)
for d in $RAFT_DIRS; do
  echo "  - raft: $d"
  fix_raft_dir "$d"
done

# Vault log directories (audit.json lives here) — dir 0750 recommended
for d in $LOG_DIRS; do
  echo "  - logs: $d"
  fix_log_dir "$d"
done

# Any extra dirs (generic 0755)
for d in $EXTRA_DIRS; do
  echo "  - extra: $d"
  fix_extra_dir "$d"
done

echo "✅ setup-volume-ownerships done."