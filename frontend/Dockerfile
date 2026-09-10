# Multi-stage build: `dev` target for hot-reload, `prod` target (default) for a
# minimal Next.js standalone runtime image.
#   docker build --target dev ./frontend    # npm run dev
#   docker build ./frontend                 # prod standalone (node server.js)

# ---- deps: install from lockfile (cached independently of source) ----
FROM node:20-bullseye AS deps
WORKDIR /app
# Prefer IPv4: some hosts publish AAAA records for the npm registry but have no
# working IPv6 route, which makes installs hang on connection timeouts.
ENV NODE_OPTIONS=--dns-result-order=ipv4first
COPY package.json package-lock.json ./
# Cache mount keeps the npm download cache across builds (BuildKit/buildx), so
# rebuilds don't re-download every tarball on slow links.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ---- dev: full source + node_modules, hot reload ----
FROM node:20-bullseye AS dev
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---- builder: produce standalone production build ----
FROM node:20-bullseye AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined at build time; pass via --build-arg.
ARG NEXT_PUBLIC_API_URL=http://localhost:5000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod: minimal runtime from standalone output ----
FROM node:20-bullseye-slim AS prod
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Copy the standalone tree (Next may nest it under projects/... when it detects
# a repo root, or flatten it otherwise) then normalize server.js to /app.
COPY --from=builder /app/.next/standalone/ /tmp/standalone/
RUN SERVER_DIR="$(dirname "$(find /tmp/standalone -name server.js -not -path '*/node_modules/*' | head -1)")" \
    && cp -a "$SERVER_DIR/." /app/ \
    && rm -rf /tmp/standalone
# Static assets + public are served relative to the standalone root
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
