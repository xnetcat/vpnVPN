vpn-server (Rust)

- Exposes `/health` and `/metrics` on `ADMIN_PORT` (default 8080)
- Listens on UDP 51820 and TCP 51820 as stubs
- Built statically for Linux (musl)

Env vars:

- `LISTEN_UDP_PORT` (default 51820)
- `LISTEN_TCP_PORT` (default 51820)
- `ADMIN_PORT` (default 8080)
- `INSTANCE_ID` (EC2 metadata, used for CloudWatch metrics)
- `ASG_NAME` (Auto Scaling Group name, used for metrics dimensions)
- `METRICS_INTERVAL_SECONDS` (optional publishing interval override)
- `DISABLE_CLOUDWATCH_METRICS` (set to `1` to disable CloudWatch publishing locally)
