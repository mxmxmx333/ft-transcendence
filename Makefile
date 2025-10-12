.PHONY: all dep-check build run hosts-add hosts-remove assert-ip \
		ca vault-bootstrap-cert print-vault clean-vault-certs \
		setup-env start-vault-dev vault-deps-dev cli destroy-docker-volumes ensure-network clean-networks clean

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
SERVICES	 := api-gateway auth-user-service game-service web-application-firewall ai-opponent live-chat
SERV_AGENTS  := api-gateway-agent auth-user-service-agent game-service-agent web-application-firewall-agent ai-opponent-agent live-chat-agent
VAULT_NODES  := vault-1 vault-2 vault-3
################################################################################
# TARGETS
################################################################################

all: dep-check re

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
	@$(COMPOSE) --profile cli build cli-client

run:
	@echo "🚀 Starting services..."
	@$(COMPOSE) up -d web-application-firewall

cli:
	@$(COMPOSE) run --rm cli-client

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
	docker volume rm transcendence_vault-dev-runtime-certs transcendence_vault-dev-config transcendence_vault-dev-logs transcendence_vault-dev-data || true
	rm -rf ./services/api-gateway/certs/server.* ./services/api-gateway/certs/ca.* ./services/api-gateway/certs/vault ./services/api-gateway/certs/approle/*
	rm -rf ./services/auth-user-service/certs/server.* ./services/auth-user-service/certs/ca.* ./services/auth-user-service/certs/vault ./services/auth-user-service/certs/approle/*
	rm -rf ./services/game-service/certs/server.* ./services/game-service/certs/ca.*
	rm -rf ./services/ai-opponent/certs/server.* ./services/ai-opponent/certs/ca.*
	rm -rf ./frontend-src/certs/server.* ./frontend-src/certs/ca.*
stop-vault-dev:
	$(COMPOSE) --profile "dev" down

vault-dev-re: clean-vault-dev start-vault-dev

vault-deps-prod: setup-env 
	$(COMPOSE) --profile "prod" up --exit-code-from vault-seed-config vault-seed-config
	$(COMPOSE) --profile "prod" up --exit-code-from vault-1-seed vault-1-seed

prod: vault-deps-prod
	$(COMPOSE) --profile "prod" up -d vault-1
	$(COMPOSE) --profile "prod" up --exit-code-from setup-volume-ownerships setup-volume-ownerships
	$(COMPOSE) --profile "prod" up --exit-code-from vault-bootstrap-prod vault-bootstrap-prod
	npm run build:frontend
	$(COMPOSE) up -d $(SERVICES)
	$(COMPOSE) --profile "prod" up -d $(SERV_AGENTS)
	$(COMPOSE) --profile "prod" up -d vault-2 vault-2-agent vault-3 vault-3-agent vault-1-agent

clean-networks:
	@echo "🌐 Cleaning Docker networks…"
	@docker network rm transcendence_api-network >/dev/null 2>&1 || true
	@docker network prune -f >/dev/null 2>&1 || true
	@echo "✅ Networks cleaned."

# Remove all docker volumes of this project
PROJECT_NAME := transcendence
VOLUME_SUFFIXES := \
	web-application-firewall-certs \
	game-service-certs \
	cli-certs \
	service-agent-config \
	web-application-firewall-agent-certs \
	web-application-firewall-agent-approle \
	api-gateway-service-certs \
	api-gateway-agent-certs \
	api-gateway-agent-approle \
	api-gateway-approle-service \
	game-service-agent-certs \
	game-service-agent-approle \
	auth-user-service-agent-certs \
	auth-user-service-certs \
	auth-user-service-agent-approle \
	auth-user-service-approle \
	ai-opponent-agent-approle \
	cli-agent-approle \
	vault-dev-config \
	vault-dev-data \
	vault-dev-logs \
	vault-dev-runtime-certs \
	vault-1-config \
	vault-1-data \
	vault-1-logs \
	vault-1-runtime-certs \
	vault-2-config \
	vault-2-data \
	vault-2-logs \
	vault-2-runtime-certs \
	vault-3-config \
	vault-3-data \
	vault-3-logs \
	vault-3-runtime-certs \
	vault-1-agent-config \
	vault-1-agent-role \
	vault-2-agent-config \
	vault-2-agent-role \
	vault-3-agent-config \
	vault-3-agent-role \
	vault-keys \
	agent-server-config \
	agent-server-client-config \
	vault-agent-hup \
	vault-agent-ca

# Convenience macro to prefix volumes with project name
VOLUMES := $(foreach v,$(VOLUME_SUFFIXES),$(PROJECT_NAME)_$(v))

destroy-docker-volumes:
	@echo "⚠️  Stopping stacks and deleting project volumes ($(PROJECT_NAME))…"
	# Stop stacks (keep going even if not running)
	@$(COMPOSE) --profile prod down -v --remove-orphans 2>/dev/null || true
	@$(COMPOSE) --profile dev down -v --remove-orphans 2>/dev/null || true
	# Remove known volumes for this project
	@for v in $(VOLUMES); do \
	  echo " - removing $$v"; \
	  docker volume rm -f "$$v" >/dev/null 2>&1 || true; \
	done
	# Catch-all: remove any leftover volumes that still match the project prefix
	@docker volume ls -q | awk '/^$(PROJECT_NAME)_/ {print $$0}' | xargs -r docker volume rm -f >/dev/null 2>&1 || true
	@echo "✅ All volumes for $(PROJECT_NAME) removed."

# Remove locally built service images for this project
.destroy-images-help:
	@echo "🗑️  Removing built images for $(PROJECT_NAME)…"

destroy-service-images: .destroy-images-help
	# Remove images built by compose (have the compose project label)
	@docker images -q --filter "label=com.docker.compose.project=$(PROJECT_NAME)" | xargs -r docker rmi -f >/dev/null 2>&1 || true
	# Fallback: remove images by repository name prefix (project-service)
	@docker images --format '{{.Repository}}:{{.Tag}}' | awk '/^$(PROJECT_NAME)-/ {print $$0}' | xargs -r docker rmi -f >/dev/null 2>&1 || true
	# Final prune of dangling layers only
	@docker image prune -f >/dev/null 2>&1 || true
	@echo "✅ Built images for $(PROJECT_NAME) removed."


# Meta-clean target: nuke volumes and networks
clean: down destroy-docker-volumes clean-networks
	@echo "🧹 Project cleaned (volumes + networks)."

down:
	@echo "🛑 Stopping all services (keeping volumes)..."
	@$(COMPOSE) down --remove-orphans $(SERVICES)
	@$(COMPOSE) down --remove-orphans $(SERV_AGENTS)
	@$(COMPOSE) --profile prod down --remove-orphans

up:
	@echo "🚀 Starting all services..."
	@$(COMPOSE) up -d $(VAULT_NODES)
	@$(COMPOSE) up -d vault-unseal-prod
	@$(COMPOSE) up -d $(SERVICES)
	@$(COMPOSE) up -d $(SERV_AGENTS)

re: clean destroy-service-images prod
	@echo "🔄 Project rebuilt and restarted."

re-services: 
	@echo "🔄 Rebuilding and restarting all services (keeping volumes)..."
	@$(COMPOSE) up -d --build --no-deps --remove-orphans $(SERVICES)
	@$(COMPOSE) up -d --no-deps --remove-orphans $(SERV_AGENTS)
	@echo "✅ Services rebuilt and restarted."
