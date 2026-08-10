# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build

ENV NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY index.html tsconfig.json vite.config.mjs ./
COPY .openai ./.openai
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY worker ./worker
RUN npm run build

FROM caddy:2.10-alpine AS runtime

WORKDIR /srv

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/client/ /srv/

EXPOSE 3000

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
