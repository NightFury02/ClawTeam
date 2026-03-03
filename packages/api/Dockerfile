# ClawTeam API Server Dockerfile
# Multi-stage build for production

# Stage 1: Install dependencies and validate TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for workspace resolution
COPY package*.json ./

# Copy API package
COPY packages/api ./packages/api

# Copy shared types
COPY packages/shared ./packages/shared

# Install all dependencies (including dev for type checking)
RUN npm install

# Type check (noEmit: true — tsx runs .ts directly, no dist needed)
WORKDIR /app/packages/api
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy root package files
COPY package*.json ./

# Copy API package.json
COPY packages/api/package*.json ./packages/api/

# Copy shared package (needed for type imports at runtime)
COPY packages/shared ./packages/shared

# Install production dependencies + tsx
ENV NODE_ENV=production
RUN npm install --omit=dev && npm install tsx

# Copy source files (tsx runs .ts directly)
COPY --from=builder /app/packages/api/src ./packages/api/src
COPY --from=builder /app/packages/api/tsconfig.json ./packages/api/

# Copy migrations
COPY packages/api/migrations ./packages/api/migrations

WORKDIR /app/packages/api

ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server using tsx
CMD ["npx", "tsx", "src/server.ts"]
