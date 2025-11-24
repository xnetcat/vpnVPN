## @vpnvpn/db – Shared Prisma Client & Schema

This package owns the shared Prisma schema and generated client used by the web app, control-plane and metrics services.

### Local database configuration

Prisma needs a `DATABASE_URL` when you run CLI commands such as `prisma migrate dev` or `prisma studio`.

For the local Docker stack in `local/compose.yaml` the default Postgres URL is:

```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/vpnvpn"
```

You can either:

- export `DATABASE_URL` in your shell (recommended), or
- create a `.env` file in this directory with the same `DATABASE_URL` value (Prisma will read it automatically).

### Running local migrations

From `packages/db`:

```bash
cd packages/db

# Ensure DATABASE_URL is set (see above), then:
npx prisma migrate dev --schema prisma/schema.prisma
```

This will:

- Create or update migration files under `prisma/migrations/`
- Apply them to your local Postgres

To apply existing migrations in non-interactive environments (CI / Docker), use:

```bash
npx prisma migrate deploy --schema prisma/schema.prisma
```


