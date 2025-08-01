# === Build Stage ===
FROM node:20-alpine AS builder

# System‑Deps für node-gyp & better-sqlite3
# RUN apk add --no-cache \
#       python3 \
#       make \
#       g++ \
#       sqlite-dev

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build

# === Production Stage ===
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
