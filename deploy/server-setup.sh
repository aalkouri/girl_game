#!/usr/bin/env bash
# ONE-TIME setup, run as root on the droplet (DigitalOcean Web Console). Safe to run again.
# Creates a limited `deploy` user for GitHub deploys, plus a key pair for it.
set -euo pipefail
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
if [ ! -f /root/island-night-deploy-key ]; then ssh-keygen -q -t ed25519 -N "" -C github-deploy -f /root/island-night-deploy-key; fi
cp /root/island-night-deploy-key.pub /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /opt/game
cat > /usr/local/bin/island-night-backup <<'EOF'
#!/bin/sh
mkdir -p /var/backups/island-night && cp -a /var/lib/island-night "/var/backups/island-night/$(date +%s)"
EOF
chmod 755 /usr/local/bin/island-night-backup
cat > /etc/sudoers.d/island-night-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /bin/systemctl restart game, /usr/local/bin/island-night-backup
EOF
chmod 440 /etc/sudoers.d/island-night-deploy && visudo -cf /etc/sudoers.d/island-night-deploy
echo "Done. Private key for the GitHub secret DEPLOY_SSH_KEY is in /root/island-night-deploy-key (show it with: cat /root/island-night-deploy-key)"
