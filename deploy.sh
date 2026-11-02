#!/bin/bash
# 重新部署 discord-leveling-bot
#   ./deploy.sh          只 rebuild + 重啟（程式碼已自己 pull 好）
#   ./deploy.sh --pull    先 git pull 再 rebuild + 重啟
set -euo pipefail

cd "$(dirname "$0")"

DOCKER=docker
[ "$(id -u)" -ne 0 ] && DOCKER="sudo docker"

if [ "${1:-}" = "--pull" ]; then
  echo "==> git pull"
  git pull --ff-only
fi

echo "==> 本機版本：$(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"

echo "==> build + 重啟容器"
$DOCKER compose up -d --build

echo "==> 清掉舊 image"
$DOCKER image prune -f >/dev/null

echo "==> 狀態"
$DOCKER compose ps
echo
echo "==> 最近 log（Ctrl-C 離開）"
sleep 3
$DOCKER compose logs --tail 30
