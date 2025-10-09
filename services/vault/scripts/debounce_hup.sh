# /agents/hup.sh
#!/bin/sh
set -e

FLAG=/run/vault/.hup_pending

if [ -e "$FLAG" ]; then
  exit 0
fi

: > "$FLAG"
(
  sleep 0.3
  kill -HUP 1 2>/dev/null || true
  rm -f "$FLAG"
) &