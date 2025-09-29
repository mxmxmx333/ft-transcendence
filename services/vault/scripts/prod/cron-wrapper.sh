#!/usr/bin/env sh
set -eu
exec /usr/local/bin/rotate-node-cert.sh >> /var/log/rotate.log 2>&1
