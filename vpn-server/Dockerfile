# syntax=docker/dockerfile:1.7

FROM rust:1.83-bullseye AS builder
RUN apt-get update && apt-get install -y musl-tools pkg-config && rm -rf /var/lib/apt/lists/*
RUN rustup target add x86_64-unknown-linux-musl
WORKDIR /src
COPY Cargo.toml ./
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release --target x86_64-unknown-linux-musl
COPY . .
RUN cargo build --release --target x86_64-unknown-linux-musl

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime
WORKDIR /
COPY --from=builder /src/target/x86_64-unknown-linux-musl/release/vpn-server /vpn-server
USER 65532:65532
EXPOSE 51820/udp
EXPOSE 8080
ENV RUST_LOG=info
ENTRYPOINT ["/vpn-server"]


