# Dashboard Dockerfile (production build)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY packages/dashboard/package*.json ./
RUN npm install

# Copy source
COPY packages/dashboard/ ./

# Build
RUN npm run build

# Production image
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx template (envsubst replaces ${API_HOST} and ${ROUTER_HOST} at runtime)
COPY packages/dashboard/nginx.conf.template /etc/nginx/templates/default.conf.template

# Default values: host.docker.internal for standalone mode
# Override in docker-compose for container-to-container networking
ENV API_HOST=host.docker.internal:3000
ENV ROUTER_HOST=host.docker.internal:3100

EXPOSE 80

# nginx:alpine image auto-runs envsubst on /etc/nginx/templates/*.template → /etc/nginx/conf.d/
CMD ["nginx", "-g", "daemon off;"]
