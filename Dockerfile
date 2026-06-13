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

ENV NODE_ENV=production
# Azure App Service / Container Apps: set WEBSITES_PORT=8501
ENV PORT=8501
# adapter-node's default request-body cap is 512KB, which 500s every upload
# (attachments, bill/receipt scans, CSV imports) before the app's own
# MAX_ATTACHMENT_SIZE_MB check (default 10 MB) can answer with a friendly 413.
# Keep this slightly above that cap; a Container App env var overrides it.
ENV BODY_SIZE_LIMIT=12M

# Production deps first (own layer → cached unless package files change). Drop the
# npm cache to keep the runtime image small.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Build output + the single runtime asset.
COPY --from=builder /app/build ./build
COPY logo.png ./

# Run unprivileged: the official node image ships a non-root `node` user. Nothing
# at runtime writes to the image (attachments live in Mongo), so read-only is fine.
USER node

EXPOSE 8501

# Container-level liveness against the app's own /healthz (Container Apps also runs
# its configured probes). Uses node's global fetch — no extra tooling in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8501)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build"]
