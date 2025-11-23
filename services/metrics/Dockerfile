FROM oven/bun:1.1.38 AS builder
WORKDIR /app

# Copy monorepo files needed for install/build
COPY package.json turbo.json bun.lock* ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages

RUN bun install --frozen-lockfile

WORKDIR /app/services/metrics
RUN bun run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/services/metrics/dist ./dist

EXPOSE 4100

CMD ["node", "dist/index.js"]


