# NestJS API. Build context: repository root.
FROM node:22-alpine AS build
RUN apk add --no-cache openssl && npm install -g pnpm@10.34.9
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @gatepass/api... --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @gatepass/shared build && pnpm --filter @gatepass/api build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl && npm install -g pnpm@10.34.9
ENV NODE_ENV=production
WORKDIR /repo
# TODO(Phase 6): slim the image with `pnpm deploy --prod`.
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec prisma db seed && node dist/main.js"]
