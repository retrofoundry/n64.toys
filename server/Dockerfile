FROM node:22-alpine AS build

WORKDIR /workspace

RUN corepack enable \
    && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json

RUN pnpm install --frozen-lockfile

COPY server server

# pnpm 10 requires legacy deploy when the workspace does not inject workspace packages.
RUN pnpm --filter @n64-toys/server build \
    && pnpm --filter @n64-toys/server deploy --prod --legacy /runtime

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=build --chown=node:node /runtime/package.json ./package.json
COPY --from=build --chown=node:node /runtime/node_modules ./node_modules
COPY --from=build --chown=node:node /runtime/dist ./dist
COPY --from=build --chown=node:node /runtime/drizzle ./drizzle

USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
