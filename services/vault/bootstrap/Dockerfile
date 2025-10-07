# Stage 1: nur die vault-CLI holen (keine Pakete anfassen)
FROM hashicorp/vault:1.20 as vaultbin

# Stage 2: leichtes Tool-Image mit jq, curl, etc.
FROM alpine:3.20
RUN apk add --no-cache bash curl jq ca-certificates
COPY --from=vaultbin /bin/vault /usr/local/bin/vault

# (optional) dein Skript gleich mit ins Image legen – oder per Volume mounten
# COPY services/vault/scripts/vault-bootstrap-dev.sh /work/vault-bootstrap-dev.sh
# ENTRYPOINT ["sh", "/work/vault-bootstrap-dev.sh"]

