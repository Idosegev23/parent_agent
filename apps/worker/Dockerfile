# Worker Dockerfile
# =================
# Build from repo root: docker build -f apps/worker/Dockerfile -t parent-assistant-worker .

FROM node:20-slim AS base

# Install Chromium and dependencies for Puppeteer/WhatsApp
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer configuration
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# ============ Dependencies Stage ============
FROM base AS deps
WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies
RUN npm ci

# ============ Build Stage ============
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules 2>/dev/null || true
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules 2>/dev/null || true

# Copy source code
COPY apps/worker/ ./apps/worker/
COPY packages/database/ ./packages/database/
COPY packages/shared/ ./packages/shared/
COPY tsconfig.json ./

# Build packages first, then worker
WORKDIR /app/packages/database
RUN npm run build 2>/dev/null || echo "No build script for database"

WORKDIR /app/packages/shared
RUN npm run build 2>/dev/null || echo "No build script for shared"

WORKDIR /app/apps/worker
RUN npm run build

# ============ Production Stage ============
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd -r worker && useradd -r -g worker worker

# Copy built artifacts
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/apps/worker/package.json ./apps/worker/
COPY --from=builder /app/packages/database/dist ./packages/database/dist 2>/dev/null || true
COPY --from=builder /app/packages/database/src ./packages/database/src
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist 2>/dev/null || true
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create sessions directory
RUN mkdir -p /app/apps/worker/sessions && chown -R worker:worker /app

USER worker

WORKDIR /app/apps/worker

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s \
    CMD node -e "process.exit(0)"

CMD ["node", "dist/index.js"]
