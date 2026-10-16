#!/bin/bash
# Starts the self-hosted Convex backend. GCE runs this on every boot, so it is idempotent:
# the container and its convex-data volume persist on the boot disk across restarts.
set -euo pipefail
IMAGE="ghcr.io/convex/convex-backend:latest"
if ! command -v docker >/dev/null; then
  apt-get update -y
  apt-get install -y docker.io
  systemctl enable --now docker
fi
md() { curl -fsS -H 'Metadata-Flavor: Google' "http://metadata.google.internal/computeMetadata/v1/$1"; }
if docker inspect convex >/dev/null 2>&1; then
  docker start convex >/dev/null || true
  exit 0
fi
PROJECT=$(md project/project-id)
CLOUD_ORIGIN=$(md instance/attributes/convex-cloud-origin)
SITE_ORIGIN=$(md instance/attributes/convex-site-origin)
SECRET=$(gcloud secrets versions access latest --secret=takeone-convex-instance-secret --project="$PROJECT")
docker run -d --name convex --restart=always \
  -p 3210:3210 -p 3211:3211 -v convex-data:/convex/data \
  -e INSTANCE_NAME=takeone -e INSTANCE_SECRET="$SECRET" \
  -e CONVEX_CLOUD_ORIGIN="$CLOUD_ORIGIN" -e CONVEX_SITE_ORIGIN="$SITE_ORIGIN" \
  -e DISABLE_BEACON=true -e RUST_LOG=info -e DOCUMENT_RETENTION_DELAY=172800 \
  --log-driver=gcplogs \
  "$IMAGE"
