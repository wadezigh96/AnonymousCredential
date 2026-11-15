# ANONYMESH AnonCreds Android ARM64 validation

## Supported upstream route

The official `@hyperledger/anoncreds-react-native` package wraps the official `anoncreds-rs` native library. Its Android Gradle configuration declares `arm64-v8a` and loads the native library from its Android ABI-specific native directory. This is the preferred Android integration route.

The official Node.js wrapper is useful for Linux CI, but its Linux ARM64 binary is not proof of Android/Bionic compatibility. Do not copy a GNU/Linux `.so` into Termux and call it an Android build. The Rust Cargo dependency issue remains separate; the JavaScript wrappers use the published upstream native release.

## Current verification boundary

- Issuer-holder-verifier demo and adversarial tests run on the official Node.js native wrapper in Linux CI.
- Linux ARM64 benchmark is tracked separately from Android.
- The `anonymesh-android.yml` CI workflow builds a standalone release APK and verifies that the JavaScript bundle is embedded. This proves the Android build artifact is produced, not that the app runs on a physical device.
- **Physical Android 15 native-proof smoke test: PASS (user-reported 15 November 2026).** The user ran **Run native proof test** on a physical Android 15 device and reported the on-screen result `PROOF VERIFIED`, `Role disclosed: weather_reader`, `Private subject disclosed: false`, `Proof JSON: 18117 characters`, and `AnonCreds wrapper 0.5.0`. This confirms the single-process native proof demo ran on that device. The device model, ABI, native-library hash and performance measurements were not captured, so Android ARM64 performance remains unverified.
- Termux Node.js alone is not the supported Android integration target for the official React Native wrapper.

## Reproduction: install the CI APK and run the Android 15 smoke test

The Android build used for the reported test is [workflow run #6](https://github.com/wadezigh96/anonymesh/actions/runs/43632737251). Its artifact is named `anonymesh-android-standalone-release` (about 40 MB). The artifact archive SHA-256 reported by GitHub is:

`0a11dcaa43b27992dde27b5fe6ed8e652a1c0162022d5b5729f7c8c981b1a1bb`

On the physical Android 15 device:

1. Open the workflow run above and download `anonymesh-android-standalone-release`.
2. Extract the ZIP and locate `app-release.apk`.
3. Install the APK using the Android file manager. If Android asks, allow installation from that file manager for this install.
4. Open **ANONYMESH** and tap **Run native proof test**.
5. Expected result: **PROOF VERIFIED**, `Private subject disclosed: false`, and role `weather_reader`.
6. If it fails, capture the full error text and do not treat the CI build result as a device pass.

This is only a native AnonCreds smoke test. It does not validate the full multi-process Issuer–Holder–Verifier service, durable wallet storage, capability authorization or NEAR integration.

## Remaining device evidence to collect

The native proof smoke test has passed on a physical Android 15 device as reported above. For a reproducible device report and performance baseline, still record:
1. Device model, Android version, ABI and React Native version.
2. Exact `anoncreds-rs` release and SHA-256 of the native library.
3. Credential issuance and holder-side processing success.
4. Presentation generation and verification p50/p95 across at least 30 warm runs.
5. Proof size, peak process RSS, CPU time, and battery/thermal conditions.
6. The APK version/build identifier and a saved non-sensitive test log. The full issuer-holder-verifier adversarial tests still run in the Linux Node process integration suite; they are not all implemented in this Android smoke app.
7. Confirmation that the private subject marker is absent from the presentation JSON.

Never store link secrets, private credential JSON, private issuer keys or real identity attributes in benchmark output.

## Reproduction in Linux CI

`npm test --prefix packages/anoncreds-agent-demo` runs the native proof tests. `npm run benchmark --prefix packages/anoncreds-agent-demo` measures proof creation and verification. Output from `ubuntu-24.04-arm` is Linux ARM64 only, not Android.
