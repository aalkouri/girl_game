# Deploying Island Night

The game runs on a DigitalOcean droplet (`games-server`, 138.197.207.219): `/opt/game`, service `game`
(port 3000 behind Caddy), data in `/var/lib/island-night`.

Pushing to `main` or a `claude/**` branch runs `.github/workflows/deploy.yml`, which checks the syntax,
copies that exact commit to the droplet over SSH as the limited `deploy` user (`deploy/remote.sh`),
backs up the player data, installs packages, restarts the game and checks that it answers.

## One-time setup
1. On the droplet (DigitalOcean Web Console, as root) run `deploy/server-setup.sh`.
   It creates the `deploy` user (may only restart the `game` service and run the backup script) and an SSH key pair.
2. `cat /root/island-night-deploy-key` and copy the whole key (including the BEGIN/END lines).
3. GitHub repo > Settings > Secrets and variables > Actions > New repository secret:
   name `DEPLOY_SSH_KEY`, value = that key.
4. Delete the private key from the droplet: `shred -u /root/island-night-deploy-key` (keep the `.pub`).

## Login-code email (Resend)
Set the key for the service in a root-only file, never in git:
```
echo 'RESEND_API_KEY=re_xxx' > /etc/island-night.env && chmod 600 /etc/island-night.env
```
In `/etc/systemd/system/game.service.d/override.conf` add `EnvironmentFile=/etc/island-night.env`
and **remove `MAIL_MODE=log`**, set `MAIL_FROM=Island Night <no-reply@alkouri.com>`
(delete any old `mailFrom`/`game.alkouri.com` in `/var/lib/island-night/config.json`), then
`systemctl daemon-reload && systemctl restart game`.
Without a key (or with `MAIL_MODE=log`) login codes go to `journalctl -u game`.

Note: the host key is read with `ssh-keyscan` on the first connection of each run (not pinned).
