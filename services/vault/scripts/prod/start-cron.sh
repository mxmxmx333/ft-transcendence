#!/usr/bin/env sh
set -eu
# täglicher Lauf um 03:17
if command -v crond >/dev/null 2>&1; then
  echo "17 3 * * * /usr/local/bin/cron-wrapper.sh" > /etc/crontabs/root
  touch /var/log/rotate.log
  exec crond -f -l 8
else
  echo "17 3 * * * root /usr/local/bin/cron-wrapper.sh" > /etc/cron.d/rotate
  chmod 0644 /etc/cron.d/rotate
  touch /var/log/rotate.log
  exec cron -f
fi
