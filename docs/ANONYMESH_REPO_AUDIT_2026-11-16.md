# Audit Repo Anonymesh — 16 November 2026

## Keputusan

**Branch `fix/anonymesh-testnet-readiness` kini lulus test/build kontrak pada SHA yang diaudit, tetapi deployment Testnet belum dilakukan dan tidak boleh disebut live.** Tes Node lokal lulus 88/88. Workflow kontrak GitHub Actions [43846695123](https://github.com/wadezigh96/anonymesh/actions/runs/43846695123) sukses untuk source `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`; artifact final, SOURCE_SHA dan checksum diverifikasi.

Langkah selanjutnya tertahan pada signer Testnet yang belum tersedia/terhubung di sesi ini serta persetujuan eksplisit untuk payload transaksi lengkap. Saya tidak mengirim transaksi. **Jangan deploy dari branch default `feat/anonymesh-private-agent-identity`**: branch itu masih berada pada `a55cda5` dan belum memiliki `#[payable]` pada tiga metode mutasi registry, sementara fix sudah ada di branch readiness.

## Scope dan bukti

Audit mencakup empat README dan enam workflow pada `origin/fix/anonymesh-testnet-readiness`, ref `c8c2529d76a04be1bf8ab2ea33662ef661d463b2`. Semua 10 review selesai, tidak ada review berkas yang gagal. Secara lintas-arsitektur, proyek konsisten sebagai demo Issuer–Holder–Verifier dengan authorization berbatas policy dan NEAR sebagai registry metadata/status issuer publik. Mock RPC dan bukti lokal tidak disamakan dengan deployment live.

- `npm test --prefix packages/anoncreds-agent-demo`: **88 pass, 0 fail**. Paket tidak memiliki lockfile, jadi instalasi lokal dilakukan dengan `npm install --no-package-lock`, bukan `npm ci`.
- Run kontrak [43846695123](https://github.com/wadezigh96/anonymesh/actions/runs/43846695123) pada SHA audit sukses pada unit tests, locked WASM release build, pencatatan metadata/checksum, dan upload artifact. Workflow tidak memiliki langkah deploy atau transaksi.
- Artifact menyebut `SOURCE_SHA=c8c2529d76a04be1bf8ab2ea33662ef661d463b2` dan `BUILD_COMMAND=cargo build --locked --target wasm32-unknown-unknown --release`. SHA-256 WASM `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9` cocok dengan checksum yang dihitung ulang.
- Run terdahulu [43805451359](https://github.com/wadezigh96/anonymesh/actions/runs/43805451359) juga sukses pada `a575424`. Pemeriksaan blob menunjukkan source kontrak dan workflow pada `a575424` identik dengan ref audit. Oleh sebab itu, klaim lama di status proyek bahwa perubahan test `a55cda5` belum pernah diuji adalah keliru: `a55cda5` merupakan ancestor dari run `a575424`. Status kanonis telah dikoreksi.
- Query RPC `view_account` read-only, `finality=final`, terhadap `wkams.testnet` mengembalikan saldo `18.9 NEAR`, code hash kosong `11111111111111111111111111111111`, pada block height `277937423` dengan hash `4Qta8z5jfnZdUFa5gN3YS9qx9XbEsQyfmxqEpcz4217H`. Ini hanya membuktikan kondisi akun pada blok tersebut; tidak membuktikan adanya signer yang dapat dipakai. Skema resmi query `view_account` tersedia di dokumentasi NEAR [1] [2].

## Temuan prioritas

### P1 — Branch default tidak siap untuk deploy

Pada branch default `feat/anonymesh-private-agent-identity` (`a55cda5`), `register_issuer`, `set_issuer_active`, dan `update_status_root` belum diberi `#[payable]`, meskipun fungsi tersebut mengandalkan attached storage deposit. Branch `fix/anonymesh-testnet-readiness` menambahkan atribut itu melalui `ba4868b` dan telah lulus CI.

Runtime NEAR menolak attached deposit pada method yang tidak payable. Unit test yang memanggil fungsi Rust langsung tidak menjalankan pemeriksaan entrypoint payable runtime; jadi hasil tes pada branch default tidak cukup untuk menutup gap tersebut. Deploy hanya dari readiness branch. Jangan ubah default branch, merge, atau buat PR tanpa persetujuan terpisah.

### P1 — Signer dan live acceptance masih menjadi gate

Tidak ada signer NEAR yang terhubung/terbukti dapat digunakan dalam sesi ini. Saldo dan code hash akun bukan otorisasi transaksi. Belum ada deployment, initialization, pendaftaran test issuer, maupun verifier acceptance terhadap kontrak live.

Untuk melanjutkan, hubungkan signer Testnet melalui alur wallet/integrasi yang disetujui; jangan mengirim seed phrase atau private key melalui chat. Sebelum signing, tampilkan dan minta persetujuan eksplisit untuk network, receiver, method/arguments, deposit, gas, estimasi biaya, expected state change, dan recovery plan. Setelah deploy, baca `get_owner`/`get_issuer` dan jalankan kasus valid serta negatif dengan verifier pada Testnet.

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

1. Hubungkan signer Testnet melalui integrasi/wallet yang disetujui.
2. Review dan setujui payload deployment lengkap untuk artifact SHA `10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9`, target `wkams.testnet`, dan initialization `new({"owner_id":"wkams.testnet"})`; gas, deposit dan estimasi biaya perlu dihitung dari signer/tooling sebelum approval.
3. Deploy dan catat transaction hash, receipt, explorer link, account ID, source SHA serta checksum.
4. Daftarkan disposable public test issuer dengan storage deposit dan catat transaksi.
5. Verifikasi `get_owner`/`get_issuer` pada Testnet dan jalankan acceptance tests terhadap issuer valid, issuer unknown/inactive, mismatch key/schema, RPC outage dan data malformed.

**Belum ada transaksi yang dilakukan. Jangan menandatangani atau mengirim transaksi tanpa approval eksplisit atas exact payload dan biaya.**

## Referensi

[1]: https://docs.near.org/api/rpc/introduction "NEAR Protocol Call Reference"
[2]: https://docs.near.org/api/rpc/contracts "NEAR Accounts and Contracts RPC"
[3]: https://github.com/wadezigh96/anonymesh/actions/runs/43846695123 "NEAR Contract CI Run c8c2529"
[4]: https://github.com/wadezigh96/anonymesh/actions/runs/43805451359 "NEAR Contract CI Run a575424"
