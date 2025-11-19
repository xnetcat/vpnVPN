Infrastructure (Pulumi TypeScript)

This package defines the AWS control plane, observability stack, and regional data-plane capacity for vpnVPN.

Stacks:

- `global`
  - ECR repositories for `vpn-server` and Lambda container images.
  - Control-plane API (API Gateway + Lambda) and DynamoDB tables for servers, peers, tokens, and proxies.
  - Observability resources (CloudWatch metrics, AMP, Grafana).
- `region-us-east-1` (and other `region-*` stacks)
  - VPC, security groups, and either EC2 Auto Scaling Groups or ECS/Fargate services that run the `vpn-server` container.
  - NLB (UDP/TCP) for exposing VPN ports (WireGuard, OpenVPN, IKEv2) and admin/health endpoints.

See the `pulumi` subfolder for project files.

Key configs (region stack):

- `region:imageTag`
- `region:minInstances` / `region:maxInstances`
- `region:instanceType`
- `region:adminCidr`
- `region:targetSessionsPerInstance`

Control plane and Lambdas:

- Lambdas are written in TypeScript and built as container images (Node.js 20).
- APIs include:
  - `POST /server/register`, `POST /server/heartbeat`, `GET /server/peers`, `POST /peers`.
  - `GET /proxies` and `POST /proxies/refresh`.
- All are documented in `docs/PROJECT_SPEC.md` and are designed to expose minimal metadata, with no user-traffic logging.
