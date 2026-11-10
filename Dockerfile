# Production image (Railway, or any host that hands the app a $PORT):
# build the SPA once, then serve the static files with nginx.
#
# VITE_API_BASE_URL is baked into the bundle at build time, so it must be set
# as a build variable (on Railway: a service variable with this exact name),
# e.g. https://<your-api>.up.railway.app/api/v1
#
# The dev image (Vite dev server, used by docker-compose) is Dockerfile.dev.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# The unprivileged build runs as a non-root user. It's otherwise the same image.
FROM nginxinc/nginx-unprivileged:1.27-alpine
# nginx's entrypoint runs envsubst over /etc/nginx/templates/*.template, which
# is how the listen port follows $PORT (Railway assigns it; 8080 locally).
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
# What the app's Content-Security-Policy lets it call. Set this to the API's
# origin (https://<backend>.up.railway.app) to narrow it down.
ENV CSP_CONNECT_SRC=https:
EXPOSE 8080
