# ANONYMESH AnonCreds Android ARM64 validation

## Supported upstream route

The official `@hyperledger/anoncreds-react-native` package wraps the official `anoncreds-rs` native library. Its Android Gradle configuration declares `arm64-v8a` and loads the native library from its Android ABI-specific native directory. This is the preferred Android integration route.

The official Node.js wrapper is useful for Linux CI, but its Linux ARM64 binary is not proof of Android/Bionic compatibility. Do not copy a GNU/Linux `.so` into Termux and call it an Android build. The Rust Cargo dependency issue remains separate; the JavaScript wrappers use the published upstream native release.

## Current verification boundary

- Issuer-holder-verifier demo and adversarial tests run on the official Node.js native wrapper in Linux CI.
- Linux ARM64 benchmark is tracked separately from Android.
- The `anonymesh-android.yml` CI workflow builds a standalone release APK and verifies that the JavaScript bundle is embedded. This proves the Android build artifact is produced, not that the app runs on a physical device.
- Physical-device execution of **Run native proof test** remains pending. Android 15 runtime and Android ARM64 performance are not yet verified.
- Termux Node.js alone is not the supported Android integration target for the official React Native wrapper.

## Device acceptance checklist

Install the standalone APK produced by the `anonymesh-android-standalone-release` GitHub Actions artifact on a physical ARM64 Android device, launch ANONYMESH, and tap **Run native proof test**. Record:
1. Device model, Android version, ABI and React Native version.
2. Exact `anoncreds-rs` release and SHA-256 of the native library.
3. Credential issuance and holder-side processing success.
4. Presentation generation and verification p50/p95 across at least 30 warm runs.
5. Proof size, peak process RSS, CPU time, and battery/thermal conditions.
6. The native Android smoke-test result: proof verification succeeds and `privateSubjectDisclosed` is `false`. The full seven issuer-holder-verifier adversarial tests still run in the Linux Node process integration suite; they are not all implemented in this Android smoke app.
7. Confirmation that the private subject marker is absent from the presentation JSON.

Never store link secrets, private credential JSON, private issuer keys or real identity attributes in benchmark output.

## Reproduction in Linux CI

`npm test --prefix packages/anoncreds-agent-demo` runs the native proof tests. `npm run benchmark --prefix packages/anoncreds-agent-demo` measures proof creation and verification. Output from `ubuntu-24.04-arm` is Linux ARM64 only, not Android.
