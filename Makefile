.PHONY: all dep-check cert build run hosts-add hosts-remove assert-ip

################################################################################
# VARIABLES
################################################################################

# Compose (v2 Plugin bevorzugt, sonst v1)
COMPOSE := $(shell sh -c 'docker compose version >/dev/null 2>&1 && echo "docker compose" || (command -v docker-compose >/dev/null 2>&1 && echo "docker-compose" || echo "")')

LAN_IP ?= $(shell sh -c '\
  if command -v ip >/dev/null 2>&1; then \
    ip -4 route get 1 2>/dev/null | awk "/src/ {print \$$7; exit}"; \
  elif command -v route >/dev/null 2>&1; then \
    IF=$$(route get default 2>/dev/null | awk "/interface:/ {print \$$2; exit}" || route -n get default 2>/dev/null | awk "/interface:/ {print \$$2; exit}"); \
    (command -v ipconfig >/dev/null 2>&1 && ipconfig getifaddr $$IF) || ifconfig $$IF 2>/dev/null | awk "/inet[[:space:]]/ {print \$$2; exit}"; \
  else \
    hostname -I 2>/dev/null | awk "{print \$$1}"; \
  fi')

DOMAIN       ?= ft-transcendence.at
HOSTS_FILE   ?= /etc/hosts
HOSTS_LINE   := $(LAN_IP) $(DOMAIN)

CERT_DIR     ?= ./services/web-application-firewall/certs
OPENSSL_CONF ?= ./services/web-application-firewall/configs/openssl.conf
CERT_KEY     := $(CERT_DIR)/server.key
CERT_CRT     := $(CERT_DIR)/server.crt

################################################################################
# TARGETS
################################################################################

all: dep-check cert build run

dep-check:
	@command -v openssl >/dev/null 2>&1 || { echo "❌ openssl missing"; exit 1; }
	@command -v docker  >/dev/null 2>&1 || { echo "❌ docker missing"; exit 1; }
	@[ -n "$(COMPOSE)" ] || { echo "❌ docker compose / docker-compose missing"; exit 1; }
	@command -v npm     >/dev/null 2>&1 || { echo "❌ npm missing"; exit 1; }
	@echo "✅ deps ok"
	@if [ -f package-lock.json ]; then echo "📦 npm ci"; npm ci; else echo "📦 npm install"; npm install; fi

cert: $(CERT_KEY) $(CERT_CRT)

$(CERT_KEY) $(CERT_CRT):
	@echo "🔐 Generating self-signed certificate..."
	@mkdir -p $(CERT_DIR)
	@openssl req -x509 -days 365 -new -nodes \
	  -config $(OPENSSL_CONF) -extensions req_ext\
	  -keyout $(CERT_KEY) \
	  -out   $(CERT_CRT)
	@echo "✅ Wrote $(CERT_KEY) & $(CERT_CRT)"

build:
	@echo "🔧 Building assets & images..."
	@npm run build
	@$(COMPOSE) build web-application-firewall

run:
	@echo "🚀 Starting services..."
	@$(COMPOSE) up -d web-application-firewall

# Optional: Systemweite Domain → LAN-IP (nicht in all!)
assert-ip:
	@if [ -z "$(LAN_IP)" ]; then echo "Could not detect LAN_IP. Use: make hosts-add LAN_IP=192.168.x.y"; exit 1; fi

hosts-add: assert-ip
	@echo "➕ Adding: $(HOSTS_LINE)"
	@grep -qF "$(HOSTS_LINE)" "$(HOSTS_FILE)" || \
	  printf "%s\n" "$(HOSTS_LINE)" | sudo tee -a "$(HOSTS_FILE)" >/dev/null

hosts-remove: assert-ip
	@echo "➖ Removing: $(HOSTS_LINE)"
	@sudo cp "$(HOSTS_FILE)" "$(HOSTS_FILE).bak"
	@sudo grep -vF "$(HOSTS_LINE)" "$(HOSTS_FILE).bak" > "$(HOSTS_FILE).tmp"
	@sudo mv "$(HOSTS_FILE).tmp" "$(HOSTS_FILE)"
	@echo "💾 Backup at $(HOSTS_FILE).bak"

deps-update-minor:
	@npx npm-check-updates -w . -t minor -u
	@npx npm-check-updates -w services/api-gateway -t minor -u
	@npx npm-check-updates -w services/auth-user-service -t minor -u
	@npx npm-check-updates -w services/game-service -t minor -u
	@npm install

deps-audit:
	@npm audit --omit=dev
	@npm audit fix --omit=dev || true

deps-audit-force:
	@npm audit fix --force || true
