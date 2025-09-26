#!/bin/sh
set -eu

# Quellen (einzelne Dateien, read-only gemountet)
SRC_DEV="/source/vault-dev.hcl"
SRC_V1="/source/vault1.hcl"
SRC_V2="/source/vault2.hcl"
SRC_V3="/source/vault3.hcl"

# Ziele (je ein Verzeichnis pro Node – sind deine named volumes)
DST_DEV="/dest-dev"
DST_V1="/dest-1"
DST_V2="/dest-2"
DST_V3="/dest-3"

seed_file() {
  src="$1"; dstdir="$2"; dstname="${3:-vault.hcl}"
  dst="$dstdir/$dstname"
  [ -f "$src" ] || { echo "⚠︎ source missing: $src (skip)"; return 0; }

  mkdir -p "$dstdir"
  if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
    cp "$src" "$dst"
    chown 100:100 "$dst" 2>/dev/null || true
    chmod 0644 "$dst"
    echo "✅ seeded/updated $dst"
    touch "${dst}.updated"   # Marker, falls du später HUP triggern willst
  else
    echo "↩︎ $dst unchanged"
  fi
}

seed_file "$SRC_DEV" "$DST_DEV" "vault-dev.hcl"
seed_file "$SRC_V1"  "$DST_V1" "vault.hcl"
seed_file "$SRC_V2"  "$DST_V2" "vault.hcl"
seed_file "$SRC_V3"  "$DST_V3" "vault.hcl"

echo "✅ all done"