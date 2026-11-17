# Island Night - mobile apps (Capacitor)

The app is a thin shell that contains the game files from `../public` and connects to your game server. One codebase for the website and the apps.

## Android
Builds happen in GitHub Actions (Actions tab -> "Android build" -> Run workflow). It produces:
- `island-night-debug-apk` - an APK you can install on any Android phone to test (allow "install unknown apps").
- `island-night-release-aab` - the signed bundle for Google Play (only when the signing secrets below exist).

### One-time setup
1. Server address: set the repository variable `GAME_URL` (Settings -> Secrets and variables -> Actions -> Variables) to your game's public https address (e.g. `https://play.example.com`), or edit `mobile/game-url.txt`.
2. Signing key (needed once, keep it safe - losing it means you cannot update the app): on your computer run
   `keytool -genkeypair -v -keystore release.keystore -alias islandnight -keyalg RSA -keysize 2048 -validity 10000`
   then add these repository secrets: `ANDROID_KEYSTORE_B64` (`base64 -w0 release.keystore`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (islandnight), `ANDROID_KEY_PASSWORD`.
   (Play App Signing then re-signs the app with Google's key; this is your "upload key".)
3. Upload the `.aab` in the Play Console. See `store/STORE.md`.

### Working locally in Android Studio
`cd mobile && npm install && npm run sync && npm run open:android` (needs Node 22+). Run it on a phone or emulator from there.

## iPhone (later)
Needs a Mac build (no Mac here): the cheapest route is a GitHub Actions macOS runner or a cloud build service; `npx cap add ios` creates the project.
