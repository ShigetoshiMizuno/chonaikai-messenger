# ============================================
# Stage 1: Build frontend (React → dist/)
# ============================================
FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src/ src/
COPY public/ public/

RUN npm run build

# ============================================
# Stage 2: Install production deps (native)
# ============================================
FROM node:22-slim AS deps

WORKDIR /app

# better-sqlite3 needs native compilation
RUN apt-get update -qq && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ============================================
# Stage 3: Runtime (minimal)
# ============================================
FROM node:22-slim AS runtime

WORKDIR /app

# Create non-root user
RUN groupadd --system appuser && \
    useradd --system --gid appuser appuser

# Copy built frontend
COPY --from=build /app/dist ./dist

# Copy production node_modules (with native better-sqlite3)
COPY --from=deps /app/node_modules ./node_modules

# Copy server code and schema
COPY server/ ./server/
COPY docs/schema.sql ./docs/schema.sql
COPY package.json ./

# Data directory (will be mounted as Fly volume)
RUN mkdir -p /app/server/data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

CMD ["node", "server/index.js"]
