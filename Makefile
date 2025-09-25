.PHONY: all dep-check build run hosts-add hosts-remove assert-ip \
		ca vault-bootstrap-cert print-vault clean-vault-certs \
		setup-env start-vault-dev vault-deps-dev

################################################################################
# VARIABLES
################################################################################

# docker compose v2 bevorzugt
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

################################################################################
# TARGETS
################################################################################

all: dep-check build run

dep-check:
	@command -v openssl >/dev/null 2>&1 || { echo "❌ openssl missing"; exit 1; }
	@command -v docker  >/dev/null 2>&1 || { echo "❌ docker missing"; exit 1; }
	@[ -n "$(COMPOSE)" ] || { echo "❌ docker compose / docker-compose missing"; exit 1; }
	@command -v npm     >/dev/null 2>&1 || { echo "❌ npm missing"; exit 1; }
	@echo "✅ deps ok"
	@if [ -f package-lock.json ]; then echo "📦 npm ci"; npm ci; else echo "📦 npm install"; npm install; fi

# ---- Build/Run deiner App (unverändert) ----
build:
	@echo "🔧 Building assets & images..."
	@npm run build
	@$(COMPOSE) build web-application-firewall

run:
	@echo "🚀 Starting services..."
	@$(COMPOSE) up -d web-application-firewall

# ---- /etc/hosts Helpers (unverändert) ----
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

# ---- NPM Dependencies (unverändert) ----
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

setup-env:
	@if [ ! -f .env ]; then \
		if [ -f .env.example ]; then \
			echo "📋 Creating .env from .env.example"; \
			cp .env.example .env; \
		else \
			echo "📄 Creating new .env file"; \
			touch .env; \
		fi; \
	else \
		echo "📝 Updating existing .env file"; \
	fi
	@sed -i.bak '/^HOST_UID=/d; /^HOST_GID=/d' .env
	@printf "HOST_UID=%s\nHOST_GID=%s\n" "$$(id -u)" "$$(id -g)" >> .env
	@rm -f .env.bak
	@echo "✅ .env configured with HOST_UID=$$(id -u) and HOST_GID=$$(id -g)"

vault-deps-dev: setup-env
	$(COMPOSE) --profile "dev" up --exit-code-from vault-seed-config vault-seed-config
	$(COMPOSE) --profile "dev" up --exit-code-from vault-dev-seed vault-dev-seed

start-vault-dev: vault-deps-dev
	$(COMPOSE) --profile dev run --rm --no-deps \
	  --entrypoint sh vault-dev -lc 'mkdir -p /vault/raft /vault/logs /vault/config && chown -R 100:100 /vault/raft /vault/logs /vault/config'
	$(COMPOSE) --profile "dev" up -d vault-dev
	$(COMPOSE) --profile "dev" up --exit-code-from vault-bootstrap-dev vault-bootstrap-dev
	$(COMPOSE) --profile "dev" kill -s HUP vault-dev

clean-vault-dev: stop-vault-dev
	Docker volume rm transcendence_vault-dev-runtime-certs transcendence_vault-dev-config transcendence_vault-dev-logs transcendence_vault-dev-data || true
	rm -rf ./services/api-gateway/certs/server.* ./services/api-gateway/certs/ca.* ./services/api-gateway/certs/vault ./services/api-gateway/certs/approle
	rm -rf ./services/auth-user-service/certs/server.* ./services/auth-user-service/certs/ca.* ./services/auth-user-service/certs/vault ./services/auth-user-service/certs/approle
	rm -rf ./services/game-service/certs/server.* ./services/game-service/certs/ca.*
	rm -rf ./services/ai-opponent/certs/server.* ./services/ai-opponent/certs/ca.*
	rm -rf ./frontend-src/certs/server.* ./frontend-src/certs/ca.*
stop-vault-dev:
	$(COMPOSE) --profile "dev" down

vault-dev-re: clean-vault-dev start-vault-dev