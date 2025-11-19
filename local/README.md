Local stack & end-to-end testing

This folder contains tooling to run a local, fully wired version of vpnVPN:

- `web-app` in dev mode.
- `vpn-server` as a Docker container with `NET_ADMIN` and TUN access.
- Postgres for Prisma.
- LocalStack for the AWS control plane (DynamoDB, Lambda, API Gateway).

There are **no mock APIs** in the main local flow; all components communicate over the same HTTP interfaces used in production.

Notes:

- EC2/NLB are not emulated in LocalStack community; data-plane autoscaling should be tested against real AWS.
- Control-plane subsystems (DynamoDB/Lambda/API GW) are fully testable via LocalStack.

Commands:

- Start stack: `docker compose -f local/compose.yaml up -d`
- Set AWS endpoint for local tooling: `export AWS_ENDPOINT_URL=http://localhost:4566`
- Run the end-to-end script: `./test-flow.sh` (from this directory)
