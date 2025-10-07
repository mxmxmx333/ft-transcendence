#!/bin/sh
set -eu

# Quellen (einzelne Dateien, read-only gemountet)
SRC_DEV="/source/vault-dev.hcl"
SRC_V1="/source/vault1.hcl"
SRC_V2="/source/vault2.hcl"
SRC_V3="/source/vault3.hcl"
SRC_V1_AGENT="/source_agents/vault-1-agent.hcl"
SRC_V2_AGENT="/source_agents/vault-2-agent.hcl"
SRC_V3_AGENT="/source_agents/vault-3-agent.hcl"

SRC_CLIENT_SERVER_AGENT="/source_agents/service-server-client-agent.hcl"
SRC_SERVER_AGENT="/source_agents/service-server-agent.hcl"

# Ziele (je ein Verzeichnis pro Node – sind deine named volumes)
DST_DEV="/dest-dev"
DST_V1="/dest-1"
DST_V2="/dest-2"
DST_V3="/dest-3"
DST_V1_AGENT="/dest-1-agent"
DST_V2_AGENT="/dest-2-agent"
DST_V3_AGENT="/dest-3-agent"
DST_CLIENT_SERVER_AGENT_1="/api-gateway-agent"
DST_CLIENT_SERVER_AGENT_2="/auth-user-service-agent"
DST_SERVER_AGENT_1="/game-service-agent"
DST_SERVER_AGENT_2="/ai-opponent-agent"

seed_file() {
  src="$1"; dstdir="$2"; dstname="${3:-vault.hcl}"
  dst="$dstdir/$dstname"
  [ -f "$src" ] || { echo "⚠︎ source missing: $src (skip)"; return 0; }

  mkdir -p "$dstdir"
  if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
    cp "$src" "$dst"
    chmod 0644 "$dst"
    echo "✅ seeded/updated $dst"
    touch "${dst}.updated"   # Marker, falls du später HUP triggern willst
  else
    echo "↩︎ $dst unchanged"
  fi
}

seed_file "$SRC_DEV" "$DST_DEV" "vault-dev.hcl"
seed_file "$SRC_V1"  "$DST_V1" "vault-1.hcl"
seed_file "$SRC_V2"  "$DST_V2" "vault-2.hcl"
seed_file "$SRC_V3"  "$DST_V3" "vault-3.hcl"
seed_file "$SRC_V1_AGENT"  "$DST_V1_AGENT" "vault-1-agent.hcl"
seed_file "$SRC_V2_AGENT"  "$DST_V2_AGENT" "vault-2-agent.hcl"
seed_file "$SRC_V3_AGENT"  "$DST_V3_AGENT" "vault-3-agent.hcl"
seed_file "$SRC_CLIENT_SERVER_AGENT"  "$DST_CLIENT_SERVER_AGENT_1" "service-server-client-agent.hcl"
seed_file "$SRC_CLIENT_SERVER_AGENT"  "$DST_CLIENT_SERVER_AGENT_2" "service-server-client-agent.hcl"
seed_file "$SRC_SERVER_AGENT"  "$DST_SERVER_AGENT_1" "service-server-agent.hcl"
seed_file "$SRC_SERVER_AGENT"  "$DST_SERVER_AGENT_2" "service-server-agent.hcl"

echo "✅ all done"