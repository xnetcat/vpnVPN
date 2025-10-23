# syntax=docker/dockerfile:1.7

FROM rust:1.83-bullseye AS builder
RUN apt-get update && apt-get install -y musl-tools pkg-config && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl
WORKDIR /src
COPY Cargo.toml ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release --target x86_64-unknown-linux-musl
COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl

FROM debian:bookworm-slim AS runtime
WORKDIR /
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    iproute2 iptables wireguard-tools wireguard-go openvpn strongswan openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/target/x86_64-unknown-linux-musl/release/vpn-server /usr/local/bin/vpn-server
USER root
EXPOSE 51820/udp 1194/udp 500/udp 4500/udp
EXPOSE 8080
ENV RUST_LOG=info
ENTRYPOINT ["/usr/local/bin/vpn-server"]


