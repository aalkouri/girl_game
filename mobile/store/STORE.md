# Store listing notes (Google Play first)

**App name:** Island Night
**Package name:** `com.alkouri.islandnight`  (permanent once uploaded - change it in `mobile/capacitor.config.json` and `mobile/android/app/build.gradle` BEFORE the first upload if you want another)
**Price:** paid app, $1.99, no in-app purchases, no ads.

**Short description (80 chars):** Gather wood, keep the fire alive and survive the alien nights together.

**Full description:**
Island Night is a co-op survival game for up to 8 players. Chop trees, mine rocks, feed your campfire and build walls, gates and traps - then hold out against waves of aliens, wolves and raiders that come every night.
- Explore a whole archipelago: forest, snow and desert islands with villages, traders, hidden loot and fishing spots
- Sail between islands in boats, light new campfires and set up camps
- Unlock classes and hidden abilities, craft armor from pelts, cook meals and fish
- Play with friends in a shared room, or on your own

**Category:** Games > Adventure (or Action).   **Content rating:** fill the questionnaire honestly: cartoon violence against fantasy creatures/aliens, no gambling, no user-generated content sharing beyond a display name, online interaction between players (no chat).

**Data safety form (Play Console) - matches privacy-policy.html:**
- Data collected: Email address (account management), Name (display name), App activity/in-game progress.
- Not shared with third parties. Encrypted in transit (HTTPS/WSS). Users can request deletion (in-app + web page).
- No ads, no analytics, no location.

**Needed before you can publish (things only you can do):**
1. Host `privacy-policy.html` and `delete-account.html` somewhere public (fill in the support email first) and paste the URLs into the Play Console.
2. Create the signing key (see mobile/README.md) and add the 4 GitHub secrets.
3. Paid apps need a Google Payments merchant profile (Play Console -> Setup -> Payments profile).
4. New personal developer accounts must run a closed test with ~12 testers for 14 days before production access.

Graphics in this folder: `play-icon-512.png` (placeholder made from the in-game moon icon, 512x512), `play-feature-1024x500.png`, `screenshots/`.
