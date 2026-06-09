# Shipping Blueprint to TestFlight

The iOS app is code-complete; the only thing left is the **signed upload**, which
needs the RAVES Apple Developer account and can't be done from CI here. This is
the end-to-end checklist. The [`fastlane`](fastlane/) pipeline automates steps
4–6 into one command.

Everything that *can* be pre-configured already is: Team ID `M86QQRTURU` and
bundle id `com.ravesinc.blueprint` (in [`project.yml`](project.yml)), a 1024² app
icon, launch screen, and `ITSAppUsesNonExemptEncryption=false`.

## 0. One-time machine setup (a Mac with Xcode 16+)

```bash
brew install xcodegen
cd ios
bundle install          # installs fastlane from Gemfile (or: brew install fastlane)
```

## 1. Create the app record in App Store Connect

[App Store Connect](https://appstoreconnect.apple.com) → **Apps → +** →
- Platform **iOS**, Name **Raves Blueprint** (the app's display name),
- Bundle ID **com.ravesinc.blueprint** (register it under
  [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
  first if it isn't listed),
- SKU: anything unique, e.g. `blueprint-ios`.

If you change the bundle id, update `PRODUCT_BUNDLE_IDENTIFIER` in
[`project.yml`](project.yml) and `app_identifier` in
[`fastlane/Appfile`](fastlane/Appfile) to match.

## 2. Create an App Store Connect API key (recommended auth)

App Store Connect → **Users and Access → Integrations → App Store Connect API**
→ **+** → role **App Manager**. Download the `.p8` **once** and note:

- **Key ID** (e.g. `ABC123XYZ`)
- **Issuer ID** (UUID at the top of the page)

A key avoids Apple-ID 2FA and works unattended. (Alternative: sign in with your
Apple ID — set `FASTLANE_APPLE_ID` in the Appfile and you'll be prompted for 2FA.)

## 3. Signing (handled by the lane)

Nothing to do here — the `beta` lane provisions **App Store distribution** signing
itself, using your API key: `cert` creates/installs the distribution certificate
and `sigh` creates/installs the `com.ravesinc.blueprint AppStore` provisioning
profile, then it builds with **manual** signing. App Store certs/profiles need no
registered devices (which is why automatic signing's *development* profile — it
requires a device — can't be used on a device-less team).

## 4–6. Build + upload (one command)

```bash
cd ios
ASC_KEY_ID=ABC123XYZ \
ASC_ISSUER_ID=11111111-2222-3333-4444-555555555555 \
ASC_KEY_PATH=/absolute/path/AuthKey_ABC123XYZ.p8 \
  bundle exec fastlane beta
```

This runs `xcodegen generate`, bumps the build number past the latest on
TestFlight, archives a Release build, exports a signed App Store `.ipa` (via
[`ExportOptions.plist`](ExportOptions.plist)), and uploads it.

The build's **"What to Test"** notes are taken from
[`fastlane/changelog.txt`](fastlane/changelog.txt) (edit it before each release),
or override per-run with `TESTFLIGHT_CHANGELOG="…" bundle exec fastlane beta`.

### Manual fallback (no fastlane)

```bash
cd ios
xcodegen generate
xcodebuild -project Blueprint.xcodeproj -scheme Blueprint \
  -sdk iphoneos -configuration Release \
  -archivePath build/Blueprint.xcarchive archive
xcodebuild -exportArchive -archivePath build/Blueprint.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/export
```
Then upload `build/export/*.ipa` via **Xcode → Organizer** or
`xcrun altool --upload-app`.

## 7. Invite testers

App Store Connect → **TestFlight**. Once processing finishes (a few minutes),
add **Internal Testers** (members of your team) — no Beta App Review needed.
For people outside the org, create an **External** group (requires a short Beta
App Review).

## 8. (Later) Public App Store release

Add screenshots (reuse the `simctl io booted screenshot` shots from local
verification), description, privacy details, and submit for review from the App
Store tab.

---

**Troubleshooting**
- *"No profiles for com.ravesinc.blueprint"* → register the bundle id (step 1) and
  make sure Xcode is signed into team `M86QQRTURU`.
- *Duplicate build number* → the lane auto-increments; if uploading manually,
  bump `CURRENT_PROJECT_VERSION` in `project.yml` and regenerate.
- *`xcodegen: command not found`* → `brew install xcodegen`.
