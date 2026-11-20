#!/usr/bin/env bash
# Pull-based deploy for Island Night. Runs ON the droplet as the `deploy` user (systemd timer or by hand).
# Needs no secrets: the repo is public, so it just asks GitHub which commit the configured branch is at,
# and when that changes it downloads that exact commit, backs up the player data, installs it and restarts the game.
# If the restarted game doesn't answer, it puts the previous version back and won't retry that commit.
#   island-night-pull                  deploy the branch named in /etc/island-night-deploy.conf if it moved
#   island-night-pull --ref BRANCH     one-off: deploy BRANCH (the last-deployed marker is updated too)
#   island-night-pull --force          redeploy even if that commit was already deployed or failed
set -euo pipefail
[ -f /etc/island-night-deploy.conf ] && . /etc/island-night-deploy.conf
REPO=${REPO:-aalkouri/island_night}; REF=${REF:-refs/heads/main}; FORCE=""
while [ $# -gt 0 ]; do case "$1" in --ref) REF="refs/heads/$2"; shift 2;; --force) FORCE=1; shift;; *) shift;; esac; done
STATE=/var/lib/island-night-deploy; mkdir -p "$STATE"
exec 9>"$STATE/lock"; flock -n 9 || exit 0                  # one deploy at a time
log() { echo "[$(date -u +%FT%TZ)] $*"; }
SHA=$(git ls-remote "https://github.com/$REPO.git" "$REF" | cut -f1)
[ "${#SHA}" = 40 ] || { log "cannot read $REF of $REPO"; exit 1; }
if [ -z "$FORCE" ]; then
  [ "$SHA" = "$(cat "$STATE/last-sha" 2>/dev/null || true)" ] && exit 0
  [ "$SHA" = "$(cat "$STATE/failed-sha" 2>/dev/null || true)" ] && exit 0
fi
log "deploying $REPO $REF @ $SHA"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL --max-time 90 "https://codeload.github.com/$REPO/tar.gz/$SHA" -o "$TMP/src.tgz"
mkdir "$TMP/src"; tar xzf "$TMP/src.tgz" -C "$TMP/src" --strip-components=1
cd "$TMP/src"
node --check server.js && node --check auth.js           # never install code that doesn't even parse
sudo -n /usr/local/bin/island-night-backup               # copy of the player data first
rm -rf "$STATE/prev"; mkdir "$STATE/prev"; cp -a /opt/game/. "$STATE/prev/"   # previous version, for rollback
rm -rf /opt/game/public
cp -r server.js auth.js package.json package-lock.json public /opt/game/
if ! (cd /opt/game && npm ci --omit=dev); then ok=0; else
  sudo -n /bin/systemctl restart game; sleep 4
  if systemctl is-active --quiet game && curl -fsS http://127.0.0.1:3000/ >/dev/null; then ok=1; else ok=0; fi
fi
if [ "$ok" = 1 ]; then echo "$SHA" > "$STATE/last-sha"; rm -f "$STATE/failed-sha"; log "deployed $SHA"
else
  log "FAILED, restoring the previous version"
  rm -rf /opt/game/public /opt/game/node_modules; cp -a "$STATE/prev/." /opt/game/
  sudo -n /bin/systemctl restart game || true
  echo "$SHA" > "$STATE/failed-sha"; exit 1
fi
