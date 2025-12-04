#!/usr/bin/env bash
# =============================================================================
# vpnVPN Deployment Script
# =============================================================================
# This script automates the entire deployment process:
# 1. Loads environment from root .env
# 2. Deploys global Pulumi stack to us-east-1
# 3. Builds and pushes vpn-server Docker image
# 4. Deploys VPN nodes to specified regions
# 5. (Optional, legacy) Builds desktop apps and uploads to S3
#
# Usage:
#   ./scripts/deploy.sh [staging|production] [--skip-desktop] [--skip-vpn-nodes]
#
# Prerequisites:
#   - AWS CLI configured
#   - Pulumi CLI installed
#   - Docker installed
#   - Bun installed
#   - Rust toolchain (for desktop builds)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Configuration
# =============================================================================

ENVIRONMENT="${1:-staging}"
SKIP_DESKTOP=true
SKIP_VPN_NODES=false
ONLY_VPN=false
ONLY_DESKTOP=false

for arg in "$@"; do
  case $arg in
    --with-desktop) SKIP_DESKTOP=false ;;
    --skip-vpn-nodes) SKIP_VPN_NODES=true ;;
    --only-vpn) ONLY_VPN=true ;;
    --only-desktop) ONLY_DESKTOP=true ;;
    --add-region=*) ADD_REGION="${arg#*=}" ;;
    --nodes=*) ADD_REGION_NODES="${arg#*=}" ;;
  esac
done

if [[ "$ONLY_VPN" == "true" ]]; then
  SKIP_DESKTOP=true
  SKIP_VPN_NODES=false
fi

if [[ "$ONLY_DESKTOP" == "true" ]]; then
  SKIP_DESKTOP=false
  SKIP_VPN_NODES=true
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  log_error "Environment must be 'staging' or 'production'"
  exit 1
fi

log_info "Deploying to ${ENVIRONMENT} environment"

# =============================================================================
# Load Environment Variables
# =============================================================================

ENV_FILE="${ROOT_DIR}/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log_error "Missing .env file at ${ENV_FILE}"
  log_info "Create one based on .env.example or env.example files"
  exit 1
fi

log_info "Loading environment from ${ENV_FILE}"
set -a
source "$ENV_FILE"
set +a

# Validate required variables
REQUIRED_VARS=(
  "AWS_REGION"
  "AWS_ACCOUNT_ID"
  "PULUMI_ACCESS_TOKEN"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    log_error "Missing required environment variable: ${var}"
    exit 1
  fi
done

# Set environment-specific URLs
if [[ "$ENVIRONMENT" == "production" ]]; then
  WEB_URL="https://vpnvpn.dev"
  CONTROL_PLANE_API_URL="https://api.vpnvpn.dev"
  METRICS_API_URL="https://metrics.vpnvpn.dev"
  DESKTOP_URL="${WEB_URL}/desktop?desktop=1"
  REPO_NAME="${ECR_REPO_NAME:-vpnvpn/production}"
else
  WEB_URL="https://staging.vpnvpn.dev"
  CONTROL_PLANE_API_URL="https://api.staging.vpnvpn.dev"
  METRICS_API_URL="https://metrics.staging.vpnvpn.dev"
  DESKTOP_URL="${WEB_URL}/desktop?desktop=1"
  REPO_NAME="${ECR_REPO_NAME:-vpnvpn/staging}"
fi

log_info "Using ECR Repository: ${REPO_NAME}"

log_info "Using ECR Repository: ${REPO_NAME}"

# Parse VPN regions configuration from regions.json or environment
REGIONS_FILE="${SCRIPT_DIR}/regions.json"
if [[ -f "$REGIONS_FILE" ]]; then
  VPN_REGIONS=$(jq -c ".${ENVIRONMENT}" "$REGIONS_FILE")
  log_info "Loaded regions from ${REGIONS_FILE}"
else
  VPN_REGIONS="${VPN_REGIONS:-'[{\"region\": \"us-east-1\", \"nodes\": 1, \"min\": 1, \"max\": 5}]'}"
  log_warn "Using default regions (regions.json not found)"
fi

# If --add-region is specified, append it to the regions list (or override if exists)
if [[ -n "${ADD_REGION:-}" ]]; then
  NODES="${ADD_REGION_NODES:-2}"
  # Create JSON object for new region
  NEW_REGION_JSON=$(jq -n \
    --arg region "$ADD_REGION" \
    --argjson nodes "$NODES" \
    '{region: $region, nodes: $nodes, min: 1, max: 5, instanceType: "t3.medium"}')
  
  # Add to VPN_REGIONS array
  VPN_REGIONS=$(echo "$VPN_REGIONS" | jq --argjson new "$NEW_REGION_JSON" '. + [$new] | unique_by(.region)')
  log_info "Added region ${ADD_REGION} with ${NODES} nodes to deployment list"
fi

log_success "Environment loaded successfully"

# =============================================================================
# Step 1: Deploy Global Pulumi Stack (us-east-1)
# =============================================================================

deploy_global_stack() {
  log_info "Configuring global Pulumi stack (us-east-1)..."
  
  cd "${ROOT_DIR}/infra/pulumi"
  bun install
  
  pulumi login
  
  # Use environment-specific global stack so staging and production
  # are fully isolated (global-staging, global-production).
  STACK_NAME="global-${ENVIRONMENT}"
  pulumi stack select "${STACK_NAME}" 2>/dev/null || pulumi stack init "${STACK_NAME}"
  
  # Ensure config is set
  pulumi config set aws:region us-east-1 --stack "${STACK_NAME}"
  pulumi config set global:ecrRepoName "${REPO_NAME}" --stack "${STACK_NAME}"
  pulumi config set controlPlaneApiUrl "${CONTROL_PLANE_API_URL}" --stack "${STACK_NAME}"
  
  # Set secrets
  # Check if controlPlaneApiKey is already set
  CURRENT_API_KEY=$(pulumi config get controlPlaneApiKey --stack "${STACK_NAME}" 2>/dev/null || echo "")
  
  if [[ -z "$CURRENT_API_KEY" ]]; then
    log_info "Generating new Control Plane API Key..."
    # Generate a random 32-byte hex string (64 chars)
    NEW_API_KEY=$(openssl rand -hex 32)
    pulumi config set --secret controlPlaneApiKey "${NEW_API_KEY}" --stack "${STACK_NAME}"
    export CONTROL_PLANE_API_KEY="${NEW_API_KEY}"
    log_success "Generated and configured new Control Plane API Key"
  else
    log_info "Using existing Control Plane API Key"
    export CONTROL_PLANE_API_KEY="${CURRENT_API_KEY}"
  fi

  # Check if bootstrapToken is already set
  CURRENT_BOOTSTRAP_TOKEN=$(pulumi config get bootstrapToken --stack "${STACK_NAME}" 2>/dev/null || echo "")

  if [[ -n "$CURRENT_BOOTSTRAP_TOKEN" ]]; then
    log_info "Using existing bootstrapToken from Pulumi"
  else
    log_info "Generating new bootstrapToken..."
    # Generate a random 32-byte hex string (64 chars)
    NEW_BOOTSTRAP_TOKEN=$(openssl rand -hex 32)
    pulumi config set --secret bootstrapToken "${NEW_BOOTSTRAP_TOKEN}" --stack "${STACK_NAME}"
    log_success "Generated and configured new bootstrapToken"
  fi
  
  # Add S3 bucket for desktop downloads
  pulumi config set global:desktopBucket "${DESKTOP_S3_BUCKET:-vpnvpn-desktop-${ENVIRONMENT}}" --stack "${STACK_NAME}"
  
  if [[ "$ONLY_VPN" == "true" || "$ONLY_DESKTOP" == "true" ]]; then
    log_info "Skipping global stack deployment (--only-vpn or --only-desktop active)"
  else
    log_info "Running pulumi up for global stack..."
    pulumi up -y
  fi
  
  # Export outputs
  ECR_URI=$(pulumi stack output ecrUri --stack "${STACK_NAME}" 2>/dev/null || echo "")
  CP_TARGET=$(pulumi stack output controlPlaneDomainTarget --stack "${STACK_NAME}" 2>/dev/null || echo "")
  METRICS_TARGET=$(pulumi stack output metricsDomainTarget --stack "${STACK_NAME}" 2>/dev/null || echo "")
  
  log_success "Global stack configured"
  cd "${ROOT_DIR}"
}

# =============================================================================
# Step 2: Build and Push VPN Server Image
# =============================================================================

build_vpn_server() {
  if [[ "$ONLY_DESKTOP" == "true" ]]; then
    return
  fi

  log_info "Building VPN server Docker image..."
  
  cd "${ROOT_DIR}/apps/vpn-server"
  
  # Generate image tag from git commit
  IMAGE_TAG="${IMAGE_TAG:-sha-$(git rev-parse --short HEAD)}"
  
  # Generate image tag from git commit
  IMAGE_TAG="${IMAGE_TAG:-sha-$(git rev-parse --short HEAD)}"
  
  ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/${REPO_NAME}"
  FULL_IMAGE="${ECR_URI}:${IMAGE_TAG}"
  FULL_IMAGE="${ECR_URI}:${IMAGE_TAG}"
  
  log_info "Building image: ${FULL_IMAGE}"
  docker build -t "${FULL_IMAGE}" .
  
  # Login to ECR
  log_info "Logging into ECR..."
  aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"
  
  # Push image
  log_info "Pushing image to ECR..."
  docker push "${FULL_IMAGE}"
  
  # Also tag as latest for the environment
  docker tag "${FULL_IMAGE}" "${ECR_URI}:${ENVIRONMENT}-latest"
  docker push "${ECR_URI}:${ENVIRONMENT}-latest"
  
  log_success "VPN server image pushed: ${FULL_IMAGE}"
  cd "${ROOT_DIR}"
  
  export IMAGE_TAG
}

# =============================================================================
# Step 3: Deploy VPN Nodes to Regions
# =============================================================================

# =============================================================================
# Step 3: Deploy VPN Nodes to Regions
# =============================================================================

deploy_vpn_nodes() {
  if [[ "$SKIP_VPN_NODES" == "true" ]]; then
    log_warn "Skipping VPN node deployment (--skip-vpn-nodes)"
    return
  fi
  
  log_info "Deploying VPN nodes to regions..."
  
  cd "${ROOT_DIR}/infra/pulumi"
  
  # Parse regions JSON
  REGIONS=$(echo "${VPN_REGIONS}" | jq -c '.[]')
  
  while IFS= read -r region_config; do
    REGION=$(echo "$region_config" | jq -r '.region')
    NODES=$(echo "$region_config" | jq -r '.nodes // 2')
    MIN=$(echo "$region_config" | jq -r '.min // 1')
    MAX=$(echo "$region_config" | jq -r '.max // 10')
    INSTANCE_TYPE=$(echo "$region_config" | jq -r '.instanceType // "t3.medium"')
    
    STACK_NAME="region-${REGION}-${ENVIRONMENT}"
    
    log_info "Deploying ${NODES} nodes to ${REGION}..."
    
    pulumi stack select "${STACK_NAME}" 2>/dev/null || pulumi stack init "${STACK_NAME}"
    
    # Generate unique VPN token for this region/stack if not already set
    # We check if the secret is already set in Pulumi config to avoid re-generating on every deploy
    # Note: Pulumi config get --secret returns the value, so we can check if it exists.
    # However, for simplicity and rotation, we can also check if we want to force rotation.
    # Here we try to get it, if it fails or is empty, we generate a new one.
    
    CURRENT_TOKEN=$(pulumi config get region:vpnToken --stack "${STACK_NAME}" 2>/dev/null || echo "")
    
    if [[ -z "$CURRENT_TOKEN" ]]; then
      log_info "Generating new VPN token for ${REGION}..."
      
      # Call Control Plane to generate token
      # We need the Control Plane URL and API Key
      TOKEN_RESP=$(curl -s -X POST "${CONTROL_PLANE_API_URL}/admin/tokens" \
        -H "x-api-key: ${CONTROL_PLANE_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"label\": \"${STACK_NAME}\"}")
      
      NEW_TOKEN=$(echo "$TOKEN_RESP" | jq -r '.token')
      
      if [[ -z "$NEW_TOKEN" || "$NEW_TOKEN" == "null" ]]; then
        log_error "Failed to generate VPN token: ${TOKEN_RESP}"
        exit 1
      fi
      
      pulumi config set --secret region:vpnToken "${NEW_TOKEN}" --stack "${STACK_NAME}"
      log_success "Generated and configured new VPN token"
    else
      log_info "Using existing VPN token for ${REGION}"
    fi
    
    pulumi config set aws:region "${REGION}"
    pulumi config set aws:region "${REGION}"
    pulumi config set global:ecrRepoName "${REPO_NAME}"
    pulumi config set region:imageTag "${IMAGE_TAG}"
    pulumi config set region:imageTag "${IMAGE_TAG}"
    pulumi config set region:desiredInstances "${NODES}"
    pulumi config set region:minInstances "${MIN}"
    pulumi config set region:maxInstances "${MAX}"
    pulumi config set region:instanceType "${INSTANCE_TYPE}"
    pulumi config set region:adminCidr "0.0.0.0/0"
    
    pulumi up -y
    
    # Get NLB DNS
    NLB_DNS=$(pulumi stack output nlbDnsName 2>/dev/null || echo "")
    log_success "Region ${REGION} deployed. NLB: ${NLB_DNS}"
    
  done <<< "$REGIONS"
  
  cd "${ROOT_DIR}"
}

# =============================================================================
# Step 4: Build Desktop Apps
# =============================================================================

build_desktop_apps() {
  if [[ "$SKIP_DESKTOP" == "true" ]]; then
    log_warn "Skipping desktop app build (--skip-desktop)"
    return
  fi
  
  log_info "Building desktop apps for ${ENVIRONMENT}..."
  
  cd "${ROOT_DIR}/apps/desktop"
  
  # Install dependencies
  bun install
  
  # Set environment variables for build - these get hardcoded into the bundle
  export VITE_VPNVPN_DESKTOP_URL="${DESKTOP_URL}"
  export VITE_VPNVPN_API_URL="${WEB_URL}"
  
  log_info "Desktop URL: ${DESKTOP_URL}"
  log_info "API URL: ${WEB_URL}"
  
  # Build frontend (this bundles into dist/ which Tauri embeds)
  log_info "Building desktop frontend with Vite..."
  bun run build:web
  
  # Update tauri.conf.json with environment-specific values
  if [[ "$ENVIRONMENT" == "production" ]]; then
    BUNDLE_ID="com.vpnvpn.desktop"
    APP_NAME="vpnVPN Desktop"
    APP_VERSION="${APP_VERSION:-1.0.0}"
  else
    BUNDLE_ID="com.vpnvpn.desktop.staging"
    APP_NAME="vpnVPN Desktop (Staging)"
    APP_VERSION="${APP_VERSION:-0.1.0}"
  fi
  
  # Construct ephemeral config override
  CONFIG_OVERRIDE=$(jq -n \
    --arg name "$APP_NAME" \
    --arg id "$BUNDLE_ID" \
    --arg ver "$APP_VERSION" \
    '{productName: $name, identifier: $id, version: $ver}')
  
  # Build Tauri app
  log_info "Building Tauri desktop app with config override..."
  # Use bun run tauri to use the local CLI and pass config
  bun run tauri build --config "$CONFIG_OVERRIDE"
  
  # Collect build artifacts
  ARTIFACTS_DIR="${ROOT_DIR}/dist/desktop/${ENVIRONMENT}"
  mkdir -p "${ARTIFACTS_DIR}"
  
  log_info "Collecting build artifacts..."
  
  # Copy artifacts based on OS
  # Copy artifacts based on OS
  # Note: Tauri v2 puts target in src-tauri/target by default when running from project root
  case "$(uname -s)" in
    Darwin)
      if ls src-tauri/target/release/bundle/dmg/*.dmg 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/dmg/*.dmg "${ARTIFACTS_DIR}/"
        log_success "macOS DMG built"
      fi
      if ls src-tauri/target/release/bundle/macos/*.app 1> /dev/null 2>&1; then
        # Zip the .app for easier distribution
        for app in src-tauri/target/release/bundle/macos/*.app; do
          APP_BASENAME=$(basename "$app" .app)
          (cd src-tauri/target/release/bundle/macos && zip -r "${ARTIFACTS_DIR}/${APP_BASENAME}.app.zip" "$(basename "$app")")
        done
        log_success "macOS App bundle built"
      fi
      ;;
    Linux)
      if ls src-tauri/target/release/bundle/deb/*.deb 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/deb/*.deb "${ARTIFACTS_DIR}/"
        log_success "Linux DEB built"
      fi
      if ls src-tauri/target/release/bundle/appimage/*.AppImage 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/appimage/*.AppImage "${ARTIFACTS_DIR}/"
        log_success "Linux AppImage built"
      fi
      if ls src-tauri/target/release/bundle/rpm/*.rpm 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/rpm/*.rpm "${ARTIFACTS_DIR}/"
        log_success "Linux RPM built"
      fi
      ;;
    MINGW*|MSYS*|CYGWIN*)
      if ls src-tauri/target/release/bundle/msi/*.msi 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/msi/*.msi "${ARTIFACTS_DIR}/"
        log_success "Windows MSI built"
      fi
      if ls src-tauri/target/release/bundle/nsis/*.exe 1> /dev/null 2>&1; then
        cp -v src-tauri/target/release/bundle/nsis/*.exe "${ARTIFACTS_DIR}/"
        log_success "Windows NSIS installer built"
      fi
      ;;
  esac
  
  # List artifacts
  log_info "Build artifacts:"
  ls -la "${ARTIFACTS_DIR}/"
  
  log_success "Desktop app built. Artifacts in ${ARTIFACTS_DIR}"
  cd "${ROOT_DIR}"
}

# =============================================================================
# Step 5: Upload Desktop Apps to S3
# =============================================================================

upload_desktop_to_s3() {
  if [[ "$SKIP_DESKTOP" == "true" ]]; then
    return
  fi
  
  log_info "Uploading desktop apps to S3..."
  
  ARTIFACTS_DIR="${ROOT_DIR}/dist/desktop/${ENVIRONMENT}"
  S3_BUCKET="${DESKTOP_S3_BUCKET:-vpnvpn-desktop-${ENVIRONMENT}}"
  S3_PREFIX="releases/${ENVIRONMENT}"
  
  if [[ ! -d "${ARTIFACTS_DIR}" ]]; then
    log_warn "No desktop artifacts found at ${ARTIFACTS_DIR}"
    return
  fi
  
  # Create bucket if it doesn't exist
  aws s3 mb "s3://${S3_BUCKET}" --region us-east-1 2>/dev/null || true
  
  # Upload artifacts
  aws s3 sync "${ARTIFACTS_DIR}/" "s3://${S3_BUCKET}/${S3_PREFIX}/" \
    --cache-control "max-age=3600"
  
  # Create latest symlinks
  shopt -s nullglob
  for file in "${ARTIFACTS_DIR}"/*; do
    shopt -u nullglob
    FILENAME=$(basename "$file")
    EXTENSION="${FILENAME##*.}"
    LATEST_NAME="vpnvpn-desktop-latest.${EXTENSION}"
    
    aws s3 cp "s3://${S3_BUCKET}/${S3_PREFIX}/${FILENAME}" \
      "s3://${S3_BUCKET}/${S3_PREFIX}/${LATEST_NAME}"
  done
  
  log_success "Desktop apps uploaded to s3://${S3_BUCKET}/${S3_PREFIX}/"
  
  # Print download URLs
  echo ""
  echo "  Linux:  https://${S3_BUCKET}.s3.amazonaws.com/${S3_PREFIX}/vpnvpn-desktop-latest.AppImage"
  echo ""
}

# =============================================================================
# Step 6: Verify Deployment
# =============================================================================

verify_deployment() {
  log_info "Verifying deployment..."
  
  # Check Control Plane Health
  if [[ -n "${CONTROL_PLANE_API_URL}" ]]; then
    log_info "Checking Control Plane: ${CONTROL_PLANE_API_URL}/health"
    if curl -s -f -o /dev/null "${CONTROL_PLANE_API_URL}/health"; then
      log_success "Control Plane is healthy"
    else
      log_warn "Control Plane health check failed!"
      
      # Check for SSL/DNS mismatch
      if [[ -n "${CP_TARGET}" ]]; then
        DOMAIN=$(echo "${CONTROL_PLANE_API_URL}" | awk -F/ '{print $3}')
        RESOLVED=$(dig +short "$DOMAIN" | grep "execute-api" || echo "")
        
        if [[ -n "$RESOLVED" && "$RESOLVED" != *"$CP_TARGET"* ]]; then
           log_error "DNS MISMATCH DETECTED!"
           echo "  Domain:   $DOMAIN"
           echo "  Resolved: $RESOLVED"
           echo "  Expected: $CP_TARGET"
           echo ""
           echo -e "${YELLOW}ACTION REQUIRED:${NC} Update your CNAME record for $DOMAIN to point to $CP_TARGET"
        elif [[ -z "$RESOLVED" ]]; then
           # If dig didn't return a CNAME (maybe it returned an IP), try to see if it's a CNAME record
           CNAME=$(dig +short CNAME "$DOMAIN")
           if [[ -n "$CNAME" && "$CNAME" != *"$CP_TARGET"* ]]; then
             log_error "DNS MISMATCH DETECTED!"
             echo "  Domain:   $DOMAIN"
             echo "  Current:  $CNAME"
             echo "  Expected: $CP_TARGET"
             echo ""
             echo -e "${YELLOW}ACTION REQUIRED:${NC} Update your CNAME record for $DOMAIN to point to $CP_TARGET"
           fi
        fi
      fi
    fi
  fi

  # Check Metrics Health
  if [[ -n "${METRICS_API_URL}" ]]; then
    log_info "Checking Metrics Service: ${METRICS_API_URL}/health"
    if curl -s -f -o /dev/null "${METRICS_API_URL}/health"; then
      log_success "Metrics Service is healthy"
    else
      log_warn "Metrics Service health check failed!"
       if [[ -n "${METRICS_TARGET}" ]]; then
        DOMAIN=$(echo "${METRICS_API_URL}" | awk -F/ '{print $3}')
        CNAME=$(dig +short CNAME "$DOMAIN")
         if [[ -n "$CNAME" && "$CNAME" != *"$METRICS_TARGET"* ]]; then
             log_error "DNS MISMATCH DETECTED!"
             echo "  Domain:   $DOMAIN"
             echo "  Current:  $CNAME"
             echo "  Expected: $METRICS_TARGET"
             echo ""
             echo -e "${YELLOW}ACTION REQUIRED:${NC} Update your CNAME record for $DOMAIN to point to $METRICS_TARGET"
         fi
       fi
    fi
  fi
}

# =============================================================================
# Step 6: Print Summary
# =============================================================================

print_summary() {
  echo ""
  echo "============================================================================="
  echo -e "${GREEN}Deployment Complete!${NC}"
  echo "============================================================================="
  echo ""
  echo "Environment: ${ENVIRONMENT}"
  echo ""
  echo "Services:"
  echo "  Web App:       ${WEB_URL}"
  echo "  Control Plane: ${CONTROL_PLANE_API_URL}"
  echo "  Metrics:       ${METRICS_API_URL:-N/A}"
  echo ""
  echo "VPN Regions:"
  echo "${VPN_REGIONS}" | jq -r '.[] | "  \(.region): \(.nodes) nodes"'
  echo ""
  echo "Desktop Downloads:"
  echo "  Bucket: s3://${DESKTOP_S3_BUCKET:-vpnvpn-desktop-${ENVIRONMENT}}"
  echo ""
  echo "Next Steps:"
  echo "  1. Verify VPN nodes are registered: curl ${CONTROL_PLANE_API_URL}/servers"
  echo "  2. Test desktop app download links"
  echo "  3. Verify web app at ${WEB_URL}"
  echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
  log_info "Starting vpnVPN deployment..."
  echo ""
  
  deploy_global_stack
  build_vpn_server
  deploy_vpn_nodes
  build_desktop_apps
  upload_desktop_to_s3

  verify_deployment
  print_summary
}

main

