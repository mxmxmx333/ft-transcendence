# === Build Stage ===
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm install

COPY src/ ./src/
RUN npm run build
RUN npm install sharp

# === Production Stage ===
FROM node:20-alpine AS runner

WORKDIR /app

COPY package*.json ./

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

CMD ["node", "dist/server.js"]
