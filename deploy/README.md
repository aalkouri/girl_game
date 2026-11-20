# Deploying Island Night

Runs on the DigitalOcean droplet (`games-server`, 138.197.207.219): `/opt/game`, service `game` (port 3000 behind Caddy),
data in `/var/lib/island-night`. Deploys are **pull-based and need no secrets**: the repo is public, so the droplet
itself checks GitHub every minute (`island-night-pull`, run by a systemd timer as the limited `deploy` user).
When the configured branch (default `main`, set in `/etc/island-night-deploy.conf`) moves, it downloads that exact commit,
syntax-checks it, backs up the player data, installs it, restarts `game` and checks that it answers.
If the game doesn't answer it restores the previous version and will not retry that commit. Logs: `journalctl -u island-night-pull`.

## One-time install (as root on the droplet)
1. Get the `deploy/` folder onto the droplet (e.g. `git clone https://github.com/aalkouri/island_night.git /root/in && cd /root/in/deploy`) and run `bash install-pull-deploy.sh`.
2. First deploy by hand, from the branch that has the code you want live:
   `sudo -u deploy /usr/local/bin/island-night-pull --ref BRANCH_NAME`
3. Once `main` contains that same code, enable the automatic timer: `systemctl enable --now island-night-pull.timer`.
   (Don't enable it earlier: it would deploy `main`, which could be older than what you just deployed.)
4. Delete the old SSH deploy key if one was added: remove the `github-deploy` line from `/home/deploy/.ssh/authorized_keys` and `shred -u /root/island-night-deploy-key`.

## Login-code email (Resend)
The key goes in a root-only file, never in git or chat. In the droplet console type the key yourself so it is not stored in shell history:
```
read -rs K && printf 'RESEND_API_KEY=%s\n' "$K" > /etc/island-night.env && unset K && chmod 600 /etc/island-night.env
```
In `/etc/systemd/system/game.service.d/override.conf` add `EnvironmentFile=/etc/island-night.env`, **remove `MAIL_MODE=log`**, add
`Environment="MAIL_FROM=Island Night <no-reply@alkouri.com>"`, delete any old `mailFrom`/`sesRegion`/`game.alkouri.com` in
`/var/lib/island-night/config.json`, then `systemctl daemon-reload && systemctl restart game`.
Without a key (or with `MAIL_MODE=log`) login codes go to `journalctl -u game`.
