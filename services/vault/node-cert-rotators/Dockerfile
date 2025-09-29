FROM hashicorp/vault:1.17

USER root
# jq + cron installieren (alpine/debian fallback)
RUN set -eux; \
    if command -v apk >/dev/null 2>&1; then \
      apk add --no-cache jq ca-certificates busybox; \
    elif command -v apt-get >/dev/null 2>&1; then \
      apt-get update && apt-get install -y --no-install-recommends jq ca-certificates cron && rm -rf /var/lib/apt/lists/*; \
    else \
      echo "Unknown base OS"; exit 1; \
    fi

COPY services/vault/scripts/rotate-node-cert.sh /usr/local/bin/rotate-node-cert.sh
COPY services/vault/scripts/cron-wrapper.sh      /usr/local/bin/cron-wrapper.sh
COPY services/vault/scripts/start-cron.sh        /usr/local/bin/start-cron.sh
RUN chmod +x /usr/local/bin/*.sh

CMD ["/usr/local/bin/start-cron.sh"]
