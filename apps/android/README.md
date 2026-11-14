# ANONYMESH Android native proof smoke test

This app is an Android integration slice for the official
`@hyperledger/anoncreds-react-native` 0.5.0 wrapper.

## What it checks

- Loads the upstream native AnonCreds module in a React Native Android app.
- Creates a demo schema, credential definition, offer and credential.
- Creates a holder link secret and processes the credential.
- Builds a selective-disclosure presentation: `agent_role` is revealed and
  `valid_until` is checked as a hidden predicate.
- Verifies the proof and checks that the private subject marker is absent.

## Important security boundary

This is deliberately a **single-process, local smoke test**. Issuer, holder and
verifier execute inside one app process; the issuer private key and holder
wallet exist only in memory for the duration of the test. It is not the
separate-process protocol demo, not durable wallet storage, not an authenticated
network protocol, and not production-ready. Never enter real identity data or
production issuer keys. Revocation and unlinkable presentations are not
implemented here.

The issuer/holder/verifier process integration remains in
`packages/anoncreds-agent-demo`. This app only validates the native Android
binding and cryptographic proof path on a real device.

## Build

Requires Node.js 22.13+, Java 17, Android SDK and Android NDK matching the
Expo SDK 58 / React Native 0.88 toolchain.

```sh
cd apps/android
npm install --no-audit --no-fund
npx expo install --check
npx expo prebuild --platform android --no-install
cd android
./gradlew assembleDebug
```

Install `android/app/build/outputs/apk/debug/app-debug.apk` on an ARM64
Android device and tap **Run native proof test**. A successful CI APK build is
not proof that the native module runs on a physical phone; record device
runtime evidence separately.
