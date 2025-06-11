# Build aşaması
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx tsc main.ts

# Runtime aşaması
FROM node:18-alpine
WORKDIR /app
RUN npm install -g http-server
COPY --from=builder /app /app
EXPOSE 80
CMD ["http-server", "-p", "80"]