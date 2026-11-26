# ==============================================================================
# frontend/Dockerfile
# Multi-stage build para la PWA de React + Vite
# ==============================================================================

# --- Etapa 1: Builder ---
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Etapa 2: Servidor de Producción (Nginx ligero) ---
FROM nginx:alpine@sha256:7fc0fb4af7bf006aeb31aea88069976060f8f0a0a86b667126742cc17f4e31ae AS runner

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/index.html"]

CMD ["nginx", "-g", "daemon off;"]
