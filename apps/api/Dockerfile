# BioTrakr API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t biotrakr-api .

FROM node:20-bookworm-slim AS build
# openssl for Prisma; python3/make/g++ in case a native module has no prebuilt binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --no-frozen-lockfile --filter @biotrakr/api...
RUN pnpm --filter @biotrakr/api exec prisma generate
RUN pnpm --filter @biotrakr/api exec nest build
# Production dependencies only, then the Prisma client for them. The schema
# is copied in first: Prisma writes the client next to the @prisma/client
# that the schema's folder resolves, so it must be generated from /out.
RUN pnpm --filter @biotrakr/api deploy --prod /out \
 && rm -rf /out/prisma && cp -r /repo/apps/api/prisma /out/prisma \
 && cd /out && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma \
 && node -e "require('@prisma/client'); console.log('Prisma client OK')"

FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/prisma ./prisma
COPY --chmod=755 apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/apps/api/src/main.js"]
