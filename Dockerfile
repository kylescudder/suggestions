# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS dependencies
WORKDIR /app
ENV HUSKY=0
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts --network-concurrency 8

FROM dependencies AS build
COPY . .
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN bun run typecheck && bun run lint && bun run build

FROM dependencies AS production-dependencies
RUN rm -rf node_modules && bun install --production --frozen-lockfile --ignore-scripts --network-concurrency 8

FROM oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS runtime
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
