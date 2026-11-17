# Audit Repo Anonymesh — 16 November 2026

> **Status correction (2026-11-17):** This is a historical audit snapshot, not a description of the current default branch. The current default branch is `main`; PR #2 was merged as `e19eb1958cfa17b40f71b2f624a3fb945e3e689d`. The registry contract includes `#[payable]` on all three mutation methods and dynamic storage-deposit accounting. The historical contract CI evidence is [run 43957294232](https://github.com/wadezigh96/anonymesh/actions/runs/43957294232); PR #2 contract/WASM CI also passed on head `774bbba1e8ef30ff2e0b0bcc1a3cb66474f22ece` ([run 44117993350](https://github.com/wadezigh96/anonymesh/actions/runs/44117993350)). The registry is deployed at `registry.wkams.testnet` and `get_owner()` was verified. Issuer registration and live verifier acceptance remain pending. The recorded `get_issuer(wkams.testnet)` preflight query checked the owner account ID, not the configured issuer ID `issuer.testnet`. See [current project status](PROJECT_STATUS.md).

## Keputusan

**Temuan historis pada snapshot audit:** branch `fix/anonymesh-testnet-readiness` lulus test/build kontrak pada SHA yang diaudit, tetapi deployment Testnet belum dilakukan pada saat snapshot tersebut. Status deployment ini kemudian diperbarui di bawah dan pada [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md). Tes Node lokal lulus 88/88. Workflow kontrak GitHub Actions [43846695123](https://github.com/wadezigh96/anonymesh/actions/runs/43846695123) sukses untuk source `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`; artifact final, SOURCE_SHA dan checksum diverifikasi.

**Pembaruan status:** kontrak registry kini telah berhasil di-deploy ke Testnet pada `registry.wkams.testnet`; owner read-back berhasil. Transaksi: [NEAR Explorer](https://explorer.testnet.near.org/transactions/DrFYWN8Kx25f3265ydvJNyfUpiPT9GpjMiQJJMBJXJYHD). Catatan ini menggantikan temuan pra-deployment di bawah. Issuer registration dan live verifier acceptance masih tertunda.

## Scope dan bukti

Audit mencakup empat README dan enam workflow pada `origin/fix/anonymesh-testnet-readiness`, ref `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`. Semua 10 review selesai, tidak ada review berkas yang gagal. Secara lintas-arsitektur, proyek konsisten sebagai demo Issuer–Holder–Verifier dengan authorization berbatas policy dan NEAR sebagai registry metadata/status issuer publik. Mock RPC dan bukti lokal tidak disamakan dengan deployment live.

- `npm test --prefix packages/anoncreds-agent-demo`: **88 pass, 0 fail**. Paket tidak memiliki lockfile, jadi instalasi lokal dilakukan dengan `npm install --no-package-lock`, bukan `npm ci`.
- Run kontrak [43846695123](https://github.com/wadezigh96/anonymesh/actions/runs/43846695123) pada SHA audit sukses pada unit tests, locked WASM release build, pencatatan metadata/checksum, dan upload artifact. Workflow tidak memiliki langkah deploy atau transaksi.
- Artifact menyebut `SOURCE_SHA=c8c2529d76a04be1bf8ab2ea33662ef661d463b2` dan `BUILD_COMMAND=cargo build --locked --target wasm32-unknown-unknown --release`. SHA-256 WASM `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9` cocok dengan checksum yang dihitung ulang.
- Run terdahulu [43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359) juga sukses pada `a575424`. Pemeriksaan blob menunjukkan source kontrak dan workflow pada `a575424` identik dengan ref audit. Oleh sebab itu, klaim lama di status proyek bahwa perubahan test `a55cda5` belum pernah diuji adalah keliru: `a55cda5` merupakan ancestor dari run `a575424`. Status kanonis telah dikoreksi.
- Query RPC `view_account` read-only, `finality=final`, terhadap `wkams.testnet` mengembalikan saldo `18.9 NEAR`, code hash kosong `11111111111111111111111111111111`, pada block height `277937423` dengan hash `4Qta8z5jfnZdUFa5gN3YS9qx9XbEsQyfmxqEpcz4217H`. Ini hanya membuktikan kondisi akun pada blok tersebut; tidak membuktikan adanya signer yang dapat dipakai. Skema resmi query `view_account` tersedia di dokumentasi NEAR [1] [2].

## Temuan prioritas

### Resolved historical finding — Branch default tidak siap untuk deploy

Pada snapshot audit `a55cda5`, `register_issuer`, `set_issuer_active`, dan `update_status_root` belum diberi `#[payable]`, meskipun fungsi tersebut mengandalkan attached storage deposit. Branch readiness menambahkan atribut itu, dan perubahan tersebut kini sudah ada pada default branch. Source saat ini juga menghitung pertumbuhan storage aktual dan mengembalikan kelebihan deposit. Kode kontrak pada commit `abaed695535f6da1c465f0e3291a4989175fb7ba` identik dengan source pada HEAD `c35db7feb5abf506df948c7b1f3319f6b443ffe1`; workflow kontrak pada commit kode tersebut berhasil. Dengan demikian, blocker payable pada default branch yang dicatat di snapshot ini telah diselesaikan. Instruksi historis untuk hanya deploy dari readiness branch tidak lagi menggambarkan keadaan branch default saat ini.

### P1 — Issuer registration dan live verifier acceptance masih menjadi gate

Kontrak telah di-deploy dan `get_owner()` sudah diverifikasi. Query `get_issuer({"issuer_id":"wkams.testnet"})` mengembalikan `null`, tetapi query tersebut menggunakan owner account ID sebagai issuer ID. GitHub bridge dikonfigurasi untuk memeriksa `issuer.testnet`; read-back live untuk ID tersebut belum tercatat. Siapkan persistent issuer Ed25519 key dan state file secara lokal; public key yang didaftarkan harus berasal dari issuer key tersebut, bukan NEAR account access key.

Sebelum registrasi, tampilkan dan minta persetujuan eksplisit untuk signer, receiver, method/arguments, storage deposit, gas, estimasi biaya, expected state change dan recovery plan. Setelah transaksi disetujui, baca kembali record dan jalankan verifier acceptance live untuk issuer valid, unknown/inactive, key/schema mismatch, RPC outage dan data malformed. Jangan kirim seed phrase atau private key melalui chat.

### P1 — Full test suite tidak menjadi PR gate pada branch readiness

`anonymesh-anoncreds.yml` menjalankan full Node suite pada push, tetapi filter `pull_request.branches` hanya menyebut `feat/anonymesh-private-agent-identity`. Workflow integrasi PR hanya menjalankan subset tes.

Jika full suite dimaksudkan menjadi gerbang pra-merge, tambahkan branch readiness ke filter dan selaraskan branch protection. Jika tidak, dokumentasikan bahwa full suite dibuktikan lewat push/manual run, bukan PR check.

### P2 — Reproduksibilitas CI belum seragam

GitHub Actions dirujuk lewat tag yang dapat berubah, misalnya `actions/checkout@v4` dan `actions/upload-artifact@v4`. Paket Node dan Android tidak memiliki lockfile yang dipakai CI; workflow menggunakan `npm install` atau menonaktifkan lockfile. Provenance artifact lebih kuat untuk WASM daripada APK/benchmark JSON.

Pin action ke SHA commit immutable dengan komentar versi. Commit lockfile yang sesuai lalu gunakan instalasi locked. Untuk artifact rilis selain WASM, sertakan source SHA dan checksum mandiri.

### P2 — Nama dan instruksi beberapa workflow/README perlu tepat

Workflow Android bernama “native proof smoke test”, tetapi CI hanya membangun APK dan memeriksa bundle; ia tidak menjalankan proof atau typecheck. Instruksi README Android awalnya membangun `assembleRelease` lalu meminta memasang `app-debug.apk`. Workflow ARM64 hanya benchmark; workflow integrasi AnonCreds menjalankan subset.

README Android sudah dikoreksi agar memasang APK release yang dibangun. Jangan menyamakan packaging/benchmark dengan runtime test Android, full integration, atau bukti Testnet live.

### P3 — Deskripsi capability di README crate terlalu luas

README `agent-auth` menyatakan crate tidak memverifikasi capability secara umum, padahal `verify_capability_chain` memvalidasi trust root, signature, parent link dan scope attenuation. README telah diperbaiki untuk membedakan validasi chain dari pengikatan hasilnya ke challenge/action serta dari policy/quota enforcement yang tetap menjadi tanggung jawab caller.

## Review per berkas

1. **`README.md`** — Menyatakan batas privasi, prototype, mock RPC dan belum live dengan jujur. Perlu memperjelas provenance serta cakupan trigger CI Node.
2. **`apps/android/README.md`** — Secara benar membatasi Android sebagai smoke app satu proses. Instruksi APK release/debug yang keliru telah diperbaiki.
3. **`contracts/near/issuer-registry/README.md`** — Akurat membatasi kontrak pada metadata/status publik; root status bukan proof revocation. CI tidak melakukan deploy.
4. **`crates/agent-auth/README.md`** — Batas Ed25519, replay dan linkability dijelaskan; klaim capability yang terlalu luas telah diperbaiki.
5. **`.github/workflows/anonymesh-agent-auth.yml`** — `cargo test --locked`, read-only, tanpa deploy; action masih berbasis tag.
6. **`.github/workflows/anonymesh-android.yml`** — Build/upload release APK, bukan runtime proof; provenance APK tidak menyertakan source SHA/checksum mandiri.
7. **`.github/workflows/anonymesh-anoncreds-integration.yml`** — Alur multi-process dan rollback lewat mock RPC lokal; subset suite, tanpa deploy.
8. **`.github/workflows/anonymesh-anoncreds.yml`** — Test/demo Node dan benchmark ARM64; PR filter tidak mencakup readiness branch; dependencies tidak dikunci.
9. **`.github/workflows/anonymesh-arm64-benchmark.yml`** — Benchmark proof lokal pada ARM64, bukan integration suite penuh; artifact JSON tidak memiliki source SHA/checksum mandiri.
10. **`.github/workflows/anonymesh-near-contract.yml`** — Test, WASM build dan artifact dengan source SHA/build command/checksum; run exact SHA audit sukses, tanpa deploy.

## Kesesuaian judul, goal, dan arsitektur

Secara umum selaras dengan tujuan Hackathon yang realistis: issuer–holder–verifier dan authorization berbatas policy diuji lokal; NEAR menyimpan metadata issuer/status publik; bukti mock tidak diklaim sebagai jaringan live. Dokumentasi juga membedakan selective disclosure dari unlinkability penuh dan opaque status root dari revocation proof. Tidak ada dasar untuk menyebut sistem production-ready.

Ketidakselarasan paling penting adalah antar-branch: branch default tertinggal dan kontraknya kehilangan `#[payable]`. Pengunjung repository yang membaca default branch dapat melihat kode yang tidak sama dengan readiness branch. Jangan memakai bukti CI satu branch sebagai bukti untuk branch lainnya.

## Sisa definition of done Testnet

1. Siapkan persistent issuer Ed25519 key dan state file dengan permission ketat; jangan commit private JWK.
2. Daftarkan public issuer record yang cocok dengan key version dan schema hash melalui owner `wkams.testnet`, setelah review eksplisit method/arguments, storage deposit, gas dan estimasi biaya.
3. Catat transaction hash dan baca kembali `get_issuer` dari Testnet.
4. Jalankan verifier acceptance live: valid issuer diterima; unknown/inactive issuer, key/schema mismatch, RPC outage dan malformed data ditolak (fail closed).
5. Rekam bukti acceptance dan perbarui status proyek.

Deployment transaction sudah dilakukan dan dicatat di [deployment record](NEAR_TESTNET_DEPLOYMENT_2026-11-16.md). Jangan melakukan transaksi lanjutan tanpa approval eksplisit atas payload dan biaya.

## Referensi

[1]: https://docs.near.org/api/rpc/introduction "NEAR Protocol Call Reference"
[2]: https://docs.near.org/api/rpc/contracts "NEAR Accounts and Contracts RPC"
[3]: https://github.com/wadezigh96/anonymesh/actions/runs/43846695123 "NEAR Contract CI Run c8c2529"
[4]: https://github.com/wadezigh96/anonymesh/actions/runs/43805451359 "NEAR Contract CI Run a575424"
