#!/bin/bash
# Build the daemon and copy it with the correct target triple name for Tauri bundling.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_TAURI_DIR="$(dirname "$SCRIPT_DIR")"
DAEMON_DIR="$SRC_TAURI_DIR/../daemon"
BINARIES_DIR="$SRC_TAURI_DIR/binaries"

# Determine the target triple
ARCH=$(uname -m)
OS=$(uname -s)

case "$OS" in
    Darwin)
        case "$ARCH" in
            x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
            arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
            *) echo "Unknown architecture: $ARCH"; exit 1 ;;
        esac
        EXT=""
        ;;
    Linux)
        case "$ARCH" in
            x86_64) TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
            aarch64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
            *) echo "Unknown architecture: $ARCH"; exit 1 ;;
        esac
        EXT=""
        ;;
    MINGW*|MSYS*|CYGWIN*|Windows*)
        case "$ARCH" in
            x86_64|AMD64) TARGET_TRIPLE="x86_64-pc-windows-msvc" ;;
            aarch64|ARM64) TARGET_TRIPLE="aarch64-pc-windows-msvc" ;;
            *) echo "Unknown architecture: $ARCH"; exit 1 ;;
        esac
        EXT=".exe"
        ;;
    *)
        echo "Unknown OS: $OS"
        exit 1
        ;;
esac

DAEMON_NAME="vpnvpn-daemon${EXT}"
SIDECAR_NAME="vpnvpn-daemon-${TARGET_TRIPLE}${EXT}"

echo "Building daemon for $TARGET_TRIPLE..."

# Build the daemon in release mode
cd "$DAEMON_DIR"
cargo build --release

# Create binaries directory if it doesn't exist
mkdir -p "$BINARIES_DIR"

# Copy the daemon with the correct sidecar name
BUILT_DAEMON="$DAEMON_DIR/target/release/$DAEMON_NAME"
SIDECAR_PATH="$BINARIES_DIR/$SIDECAR_NAME"

if [ -f "$BUILT_DAEMON" ]; then
    echo "Copying $BUILT_DAEMON -> $SIDECAR_PATH"
    cp "$BUILT_DAEMON" "$SIDECAR_PATH"
    chmod +x "$SIDECAR_PATH"
    echo "Daemon prepared successfully: $SIDECAR_PATH"
else
    echo "ERROR: Daemon binary not found at $BUILT_DAEMON"
    exit 1
fi

