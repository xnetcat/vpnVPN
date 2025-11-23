# syntax=docker/dockerfile:1.7

FROM rust:1.88-bullseye AS builder
WORKDIR /src

COPY Cargo.toml Cargo.lock ./
COPY . .
RUN cargo build --release --locked

FROM debian:bullseye-slim AS runtime
WORKDIR /
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    iproute2 iptables iputils-ping curl wireguard-tools openvpn strongswan openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/target/release/vpn-server /usr/local/bin/vpn-server
USER root
EXPOSE 51820/udp 1194/udp 500/udp 4500/udp
EXPOSE 8080
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/vpn-server"]


