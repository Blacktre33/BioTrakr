# BioTrakr web app. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t biotrakr-web .
#
# The browser calls the API at /api on the same address (the reverse proxy
# in deploy/ routes it), so one image works on any hostname.

FROM node:20-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --no-frozen-lockfile --filter @biotrakr/web...
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @biotrakr/web exec next build

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "apps/web/server.js"]
