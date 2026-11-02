#!/usr/bin/env bash
# SM-I-14: the full stack starts with docker compose and answers within 90 s.
set -euo pipefail

docker compose up -d --build

wait_for() {
  local name=$1 url=$2 deadline=$((SECONDS + 90))
  until [ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = "200" ]; do
    if [ $SECONDS -ge $deadline ]; then
      echo "FAIL: $name ($url) not healthy within 90 s"
      docker compose logs --tail=50
      exit 1
    fi
    sleep 2
  done
  echo "OK: $name ($url)"
}

wait_for api http://localhost:3000/health
wait_for web http://localhost:8080/
wait_for web-api-proxy http://localhost:8080/api/health
echo "[SM-I-14] smoke passed"
