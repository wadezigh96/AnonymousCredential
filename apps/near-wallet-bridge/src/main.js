import { readRegistryStatus } from "./read-contract.js";
import {
  createOwnerConnector,
  connectOwnerWallet,
  disconnectOwnerWallet,
} from "./wallet-connect.js";
import "./style.css";

const refreshButton = document.querySelector("#refresh");
const statusNode = document.querySelector("#status");
const codeNode = document.querySelector("#code-status");
const ownerNode = document.querySelector("#owner-status");
const issuerNode = document.querySelector("#issuer-status");
const checkedAtNode = document.querySelector("#checked-at");

function setStatus(message, kind = "neutral") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

// Wallet owner: koneksi saja, belum ada fungsi pengiriman transaksi.
const connector = createOwnerConnector();
let activeWallet = null;

const walletPanel = document.createElement("section");
walletPanel.className = "step";
walletPanel.innerHTML = `
  <h2>Owner wallet authorization</h2>
  <p>
    Hubungkan wallet NEAR Testnet milik owner kontrak.
    Akun yang diterima harus tepat <code>wkams.testnet</code>.
  </p>
  <button id="connect-owner" type="button">Connect owner wallet</button>
  <button id="disconnect-owner" type="button" hidden>
    Disconnect wallet
  </button>
  <p id="wallet-account" class="status">Belum terhubung.</p>
  <p id="wallet-status" class="status" role="status" aria-live="polite">
    Belum ada pemeriksaan wallet.
  </p>
  <p class="footnote">
    Tahap ini hanya menghubungkan dan memvalidasi akun.
    Belum ada signing, broadcast, atau perubahan registry.
  </p>
`;

refreshButton.closest(".step").after(walletPanel);

const connectButton = walletPanel.querySelector("#connect-owner");
const disconnectButton = walletPanel.querySelector("#disconnect-owner");
const walletAccountNode = walletPanel.querySelector("#wallet-account");
const walletStatusNode = walletPanel.querySelector("#wallet-status");

function resetWalletUI(message) {
  activeWallet = null;
  walletAccountNode.textContent = "Belum terhubung.";
  walletStatusNode.textContent = message;
  disconnectButton.hidden = true;
  connectButton.hidden = false;
}

connector.on("wallet:signOut", () => {
  resetWalletUI("Wallet telah terputus. Tidak ada transaksi dikirim.");
});

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  walletStatusNode.textContent = "Menghubungkan wallet Testnet...";

  try {
    const session = await connectOwnerWallet(connector);
    activeWallet = session.wallet;

    walletAccountNode.textContent = `Owner: ${session.account.accountId}`;
    walletStatusNode.textContent =
      "Owner cocok dan jaringan Testnet terpilih. Belum ada transaksi dikirim.";
    walletStatusNode.dataset.kind = "success";

    connectButton.hidden = true;
    disconnectButton.hidden = false;
  } catch (error) {
    resetWalletUI(
      `Validasi wallet gagal: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    walletStatusNode.dataset.kind = "warning";
  } finally {
    connectButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  disconnectButton.disabled = true;

  try {
    await disconnectOwnerWallet(connector, activeWallet);
    resetWalletUI("Wallet diputus. Tidak ada transaksi dikirim.");
  } catch (error) {
    walletStatusNode.textContent =
      `Gagal memutus wallet: ${error instanceof Error ? error.message : "unknown error"}`;
    walletStatusNode.dataset.kind = "warning";
  } finally {
    disconnectButton.disabled = false;
  }
});

// Pemeriksaan registry read-only yang sudah ada.
refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  setStatus("Membaca NEAR Testnet RPC…");
  codeNode.textContent = "Memeriksa…";
  ownerNode.textContent = "Memeriksa…";
  issuerNode.textContent = "Memeriksa…";

  try {
    const result = await readRegistryStatus();

    codeNode.textContent = result.codeHash;
    ownerNode.textContent = result.owner ?? "Tidak ditemukan";
    issuerNode.textContent = result.issuerRegistered
      ? JSON.stringify(result.issuer)
      : "Belum terdaftar (null)";

    const healthy = result.ownerMatches;

    setStatus(
      healthy
        ? "Pembacaan selesai. Kontrak dan owner sesuai. Tidak ada transaksi dikirim."
        : "Owner kontrak tidak cocok. Jangan lanjutkan registrasi.",
      healthy ? "success" : "warning",
    );

    checkedAtNode.textContent =
      `Final block: ${result.blockHeight ?? "not supplied"}`;
  } catch (error) {
    codeNode.textContent = "Tidak dapat diverifikasi";
    ownerNode.textContent = "Tidak dapat diverifikasi";
    issuerNode.textContent = "Tidak dapat diverifikasi";

    setStatus(
      `Pemeriksaan gagal: ${
        error instanceof Error ? error.message : "unknown error"
      }. Tidak ada transaksi dikirim.`,
      "warning",
    );
  } finally {
    refreshButton.disabled = false;
  }
});

setStatus("Siap. Tekan tombol untuk membaca status kontrak secara read-only.");
