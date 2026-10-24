# syntax=docker/dockerfile:1
FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --network-concurrency 8

FROM dependencies AS build
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN bun run typecheck && bun run build

FROM dependencies AS production-dependencies
RUN rm -rf node_modules && bun install --production --frozen-lockfile --ignore-scripts --network-concurrency 8

FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS runtime
WORKDIR /app
ARG SUGGESTIONS_REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/kylescudder/suggestions" \
      org.opencontainers.image.revision=$SUGGESTIONS_REVISION
ENV NODE_ENV=production PORT=3001 SUGGESTIONS_REVISION=$SUGGESTIONS_REVISION
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun server ./server
COPY --chown=bun:bun deploy/healthcheck.ts ./deploy/healthcheck.ts
COPY --chown=bun:bun deploy/verify.ts ./deploy/verify.ts
COPY --chown=bun:bun deploy/import-convex.ts ./deploy/import-convex.ts
USER bun
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "deploy/healthcheck.ts"]
CMD ["bun", "server/index.ts"]
