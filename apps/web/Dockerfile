FROM oven/bun:1.1.38 AS builder
WORKDIR /app

COPY package.json bun.lock* turbo.json ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages

RUN bun install --frozen-lockfile

WORKDIR /app/apps/web

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./public

RUN mkdir .next && chown nextjs:nodejs .next

# Use Next.js standalone output from the web app
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]


