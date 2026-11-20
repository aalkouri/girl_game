#!/usr/bin/env bash
# ONE-TIME install, as root on the droplet. Safe to run again. Run it from a checkout/copy of the repo's deploy/ folder.
# It does NOT start the automatic timer: do the first deploy by hand (see deploy/README.md), then enable it.
set -euo pipefail
D=$(cd "$(dirname "$0")" && pwd)
command -v git >/dev/null || apt-get install -y git
command -v flock >/dev/null || apt-get install -y util-linux
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
chown -R deploy:deploy /opt/game
install -m 755 "$D/island-night-pull.sh" /usr/local/bin/island-night-pull
cat > /usr/local/bin/island-night-backup <<'EOF'
#!/bin/sh
mkdir -p /var/backups/island-night && cp -a /var/lib/island-night "/var/backups/island-night/$(date +%s)"
EOF
chmod 755 /usr/local/bin/island-night-backup
cat > /etc/sudoers.d/island-night-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /bin/systemctl restart game, /usr/local/bin/island-night-backup
EOF
chmod 440 /etc/sudoers.d/island-night-deploy && visudo -cf /etc/sudoers.d/island-night-deploy
install -d -o deploy -g deploy /var/lib/island-night-deploy
[ -f /etc/island-night-deploy.conf ] || printf 'REPO=aalkouri/island_night\nREF=refs/heads/main\n' > /etc/island-night-deploy.conf
install -m 644 "$D/island-night-pull.service" "$D/island-night-pull.timer" /etc/systemd/system/
systemctl daemon-reload
echo "Installed. Timer NOT enabled yet. Enable later with: systemctl enable --now island-night-pull.timer"
