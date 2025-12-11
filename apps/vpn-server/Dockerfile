# syntax=docker/dockerfile:1.7

FROM rust:1.88-bullseye AS builder
WORKDIR /src

COPY Cargo.toml Cargo.lock ./
COPY . .
RUN cargo build --release

FROM debian:bullseye-slim AS runtime
WORKDIR /
RUN for i in 1 2 3; do apt-get update && break || sleep 5; done && \
    for i in 1 2 3; do DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    iproute2 iptables iputils-ping curl wireguard-tools openvpn strongswan openssl ca-certificates resolvconf && break || sleep 5; done \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/target/release/vpn-server /usr/local/bin/vpn-server
USER root
EXPOSE 51820/udp 1194/udp 500/udp 4500/udp
EXPOSE 8080
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/vpn-server", "run"]


