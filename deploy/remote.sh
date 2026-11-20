#!/usr/bin/env bash
# Runs on the droplet as the `deploy` user (piped in by the GitHub workflow). $1 = commit being deployed.
set -euo pipefail
TMP=$(mktemp -d)
trap 'rm -rf "$TMP" /tmp/island-night.tgz' EXIT
tar xzf /tmp/island-night.tgz -C "$TMP"
sudo -n /usr/local/bin/island-night-backup          # copy of the player data before anything changes
rm -rf /opt/game/public
cp -r "$TMP"/server.js "$TMP"/auth.js "$TMP"/package.json "$TMP"/package-lock.json "$TMP"/public /opt/game/
cd /opt/game && npm ci --omit=dev
sudo -n /bin/systemctl restart game
sleep 3
systemctl is-active game
curl -fsS http://127.0.0.1:3000/ >/dev/null
echo "deployed ${1:-unknown}"
