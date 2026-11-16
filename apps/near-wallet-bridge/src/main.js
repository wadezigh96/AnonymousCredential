import { readRegistryStatus } from "./read-contract.js";
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
        ? "Pembacaan selesai. Kontrak memiliki code dan owner sesuai. Tidak ada transaksi dikirim."
        : "Peringatan: owner kontrak tidak cocok dengan owner yang diharapkan. Jangan lanjutkan registrasi.",
      healthy ? "success" : "warning",
    );
    checkedAtNode.textContent = `Final block: ${result.blockHeight ?? "not supplied"}`;
  } catch (error) {
    codeNode.textContent = "Tidak dapat diverifikasi";
    ownerNode.textContent = "Tidak dapat diverifikasi";
    issuerNode.textContent = "Tidak dapat diverifikasi";
    setStatus(`Pemeriksaan gagal: ${error instanceof Error ? error.message : "unknown error"}. Tidak ada transaksi dikirim.`, "warning");
  } finally {
    refreshButton.disabled = false;
  }
});

setStatus("Siap. Tekan tombol untuk membaca status kontrak secara read-only.");
