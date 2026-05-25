#!/usr/bin/env bash
set -Eeuo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-root@47.84.187.235}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/nextchat}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/yanghong/NextChat.git}"
APP_IMAGE="${APP_IMAGE:-nextchat-local:gpt55}"
APP_CONTAINER="${APP_CONTAINER:-nextchat-gpt55}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.runtime}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://hongai.store/}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Must be run from inside the project git repository." >&2
  exit 1
fi

local_head="$(git rev-parse HEAD)"
remote_head="$(git ls-remote "$REPO_URL" "refs/heads/$DEPLOY_BRANCH" | awk '{print $1}')"

if [ -z "$remote_head" ]; then
  echo "Cannot find remote branch $DEPLOY_BRANCH at $REPO_URL." >&2
  exit 1
fi

if [ "$local_head" != "$remote_head" ]; then
  echo "Local HEAD is not pushed to $REPO_URL $DEPLOY_BRANCH." >&2
  echo "local:  $local_head" >&2
  echo "remote: $remote_head" >&2
  exit 1
fi

short_sha="$(git rev-parse --short HEAD)"
image_tag="${APP_IMAGE%:*}:$short_sha"

echo "Deploying $short_sha to $DEPLOY_HOST:$DEPLOY_DIR"

ssh "$DEPLOY_HOST" \
  "DEPLOY_DIR='$DEPLOY_DIR' DEPLOY_BRANCH='$DEPLOY_BRANCH' REPO_URL='$REPO_URL' APP_IMAGE='$APP_IMAGE' IMAGE_TAG='$image_tag' APP_CONTAINER='$APP_CONTAINER' ENV_FILE='$ENV_FILE' HEALTH_URL='$HEALTH_URL' PUBLIC_HEALTH_URL='$PUBLIC_HEALTH_URL' bash -s" <<'REMOTE'
set -Eeuo pipefail

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command on server: $1" >&2
    exit 1
  fi
}

health_check() {
  local url="$1"
  local attempt

  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 10 "$url" >/dev/null; then
        return 0
      fi
    elif command -v wget >/dev/null 2>&1; then
      if wget -q -T 10 -O /dev/null "$url"; then
        return 0
      fi
    else
      echo "Neither curl nor wget is available for health checks." >&2
      return 1
    fi

    sleep 5
  done

  return 1
}

require git
require docker

if [ ! -f "$ENV_FILE" ]; then
  echo "Runtime env file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR"
git config --global --add safe.directory "$DEPLOY_DIR" >/dev/null 2>&1 || true
cd "$DEPLOY_DIR"

if [ ! -d .git ]; then
  git init -b "$DEPLOY_BRANCH" 2>/dev/null || git init
  git remote add origin "$REPO_URL"
else
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REPO_URL"
  else
    git remote add origin "$REPO_URL"
  fi
fi

git fetch --depth=1 origin "$DEPLOY_BRANCH"
git reset --hard FETCH_HEAD

previous_image=""
if docker ps -a --format '{{.Names}}' | grep -qx "$APP_CONTAINER"; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$APP_CONTAINER" 2>/dev/null || true)"
fi

docker build --pull -t "$IMAGE_TAG" -t "$APP_IMAGE" .

if docker ps -a --format '{{.Names}}' | grep -qx "$APP_CONTAINER"; then
  docker rm -f "$APP_CONTAINER"
fi

if ! docker run -d \
  --name "$APP_CONTAINER" \
  --restart unless-stopped \
  --network host \
  --env-file "$ENV_FILE" \
  "$IMAGE_TAG" >/dev/null; then
  echo "Failed to start new container." >&2
  if [ -n "$previous_image" ]; then
    docker run -d \
      --name "$APP_CONTAINER" \
      --restart unless-stopped \
      --network host \
      --env-file "$ENV_FILE" \
      "$previous_image" >/dev/null || true
  fi
  exit 1
fi

if ! health_check "$HEALTH_URL"; then
  echo "Health check failed: $HEALTH_URL" >&2
  docker logs --tail 120 "$APP_CONTAINER" >&2 || true
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true

  if [ -n "$previous_image" ]; then
    echo "Rolling back to previous image: $previous_image" >&2
    docker run -d \
      --name "$APP_CONTAINER" \
      --restart unless-stopped \
      --network host \
      --env-file "$ENV_FILE" \
      "$previous_image" >/dev/null || true
  fi

  exit 1
fi

if [ -n "$PUBLIC_HEALTH_URL" ]; then
  health_check "$PUBLIC_HEALTH_URL" || echo "Public health check failed: $PUBLIC_HEALTH_URL" >&2
fi

docker image prune -f --filter "label=stage=builder" >/dev/null 2>&1 || true

echo "Deployment finished:"
echo "  container: $APP_CONTAINER"
echo "  image: $IMAGE_TAG"
echo "  health: $HEALTH_URL"
REMOTE
