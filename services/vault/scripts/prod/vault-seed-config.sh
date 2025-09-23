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
  if [ -f "$src" ]; then
    mkdir -p "$dstdir"
    if [ -f "$dstdir/$dstname" ]; then
      echo "↩︎ $dstdir/$dstname exists, skip"
    else
      cp "$src" "$dstdir/$dstname"
      chown 100:100 "$dstdir/$dstname" || true
      chmod 0644 "$dstdir/$dstname"
      echo "✅ seeded $dstdir/$dstname"
    fi
  else
    echo "⚠︎ source missing: $src (skip)"
  fi
}

seed_file "$SRC_DEV" "$DST_DEV"
seed_file "$SRC_V1"  "$DST_V1"
seed_file "$SRC_V2"  "$DST_V2"
seed_file "$SRC_V3"  "$DST_V3"

echo "✅ all done"