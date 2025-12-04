FROM node:20-slim AS builder
WORKDIR /app

# Copy monorepo files needed for install/build
COPY package.json turbo.json bun.lock* ./
COPY apps ./apps
COPY services ./services
COPY packages ./packages

RUN npm install -g bun
RUN bun install --frozen-lockfile

# Ensure Prisma client is generated for the shared DB package
ENV DATABASE_URL="postgresql://localhost:5432/placeholder"
RUN cd packages/db && bun run build

WORKDIR /app/services/metrics
RUN bun run build

FROM public.ecr.aws/lambda/nodejs:20 AS runner
WORKDIR ${LAMBDA_TASK_ROOT}
ENV NODE_ENV=production

# Install OpenSSL for Prisma query engine (Amazon Linux 2023 uses dnf)
RUN dnf install -y openssl \
  && dnf clean all

# Copy built app and dependencies
COPY --from=builder /app/services/metrics/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/db/prisma ./prisma

# Fail fast at build time if Prisma client/engine cannot be loaded
RUN DATABASE_URL="postgresql://placeholder:5432/vpnvpn" node -e "require('@prisma/client'); console.log('Prisma client OK in metrics image')"

CMD ["dist/lambda/lambda.handler"]


