# === Build Stage ===
FROM node:18-alpine AS builder
WORKDIR /app

# 1) package.json, tsconfig und den Front‑end‑Output kopieren
COPY services/api-gateway/package*.json services/api-gateway/tsconfig.json ./
COPY public ./public

# 2) deps installieren und App kompilieren
RUN npm install
COPY services/api-gateway/src ./src/
RUN npm run build

# === Production Stage ===
FROM node:18-alpine AS runner
WORKDIR /app

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

CMD ["node", "dist/server.js"]
