# Blueprint — SvelteKit Kanban container
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package*.json ./
COPY logo.png ./

RUN npm ci --omit=dev

ENV NODE_ENV=production
# Azure App Service / Container Apps: set WEBSITES_PORT=8501
ENV PORT=8501
EXPOSE 8501

CMD ["node", "build"]
