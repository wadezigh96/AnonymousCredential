import { NearConnector } from "@hot-labs/near-connect";
import {
  EXPECTED_ACCOUNT_ID,
  CONTRACT_ACCOUNT_ID,
  EXPECTED_WASM_SHA256,
  INITIAL_FUNDING_YOCTO,
  validateDeploymentInputs,
  buildDeploymentActions,
} from "./deploy-plan.js";
import "./style.css";

const connectButton = document.querySelector("#connect");
const deployButton = document.querySelector("#deploy");
const wasmInput = document.querySelector("#wasm");
const confirmation = document.querySelector("#confirm");
const statusNode = document.querySelector("#status");
const accountNode = document.querySelector("#account");
const wasmStatus = document.querySelector("#wasm-status");
const txNode = document.querySelector("#transaction");

let connector;
let wallet;
let connectedAccount;
let wasmBytes;
let wasmSha256;

function setStatus(message, kind = "neutral") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

function updateDeployEnabled() {
  deployButton.disabled = !(
    wallet &&
    connectedAccount?.accountId === EXPECTED_ACCOUNT_ID &&
    connectedAccount?.publicKey &&
    wasmBytes &&
    wasmSha256 === EXPECTED_WASM_SHA256 &&
    confirmation.checked
  );
}

async function connectWallet() {
  connector = new NearConnector({
    network: "testnet",
    features: { testnet: true, signAndSendTransaction: true, signMessage: true },
  });
  await connector.whenManifestLoaded;
  connector.on("wallet:signIn", async ({ accounts }) => {
    try {
      wallet = await connector.wallet();
      connectedAccount = accounts?.find((account) => account.accountId === EXPECTED_ACCOUNT_ID);
      if (!connectedAccount) {
        setStatus("Pilih akun wkams.testnet di Meteor Wallet. Deployment diblokir untuk akun lain.", "warning");
        accountNode.textContent = accounts?.map((item) => item.accountId).join(", ") || "Tidak ada akun dari wallet";
        updateDeployEnabled();
        return;
      }

      const refreshed = await wallet.getAccounts();
      const walletAccount = refreshed.find((account) => account.accountId === EXPECTED_ACCOUNT_ID);
      let publicKey = walletAccount?.publicKey ?? connectedAccount.publicKey;

      // No message signature is requested. If the wallet omits the key,
      // read the account's access-key list and accept only one unambiguous
      // FullAccess key. The actual deployment still requires wallet tx approval.
      if (!publicKey) {
        const response = await fetch("https://rpc.testnet.near.org", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "anonymesh-readonly-key-list",
            method: "query",
            params: {
              request_type: "view_access_key_list",
              finality: "final",
              account_id: EXPECTED_ACCOUNT_ID,
            },
          }),
        });
        if (!response.ok) throw new Error("RPC NEAR Testnet tidak dapat dijangkau.");
        const rpc = await response.json();
        if (rpc.error) throw new Error("RPC gagal membaca daftar access key akun.");
        const keys = rpc.result?.keys;
        if (!Array.isArray(keys)) throw new Error("Daftar access key dari RPC tidak valid.");
        const fullAccess = keys.filter((item) => item.access_key?.permission === "FullAccess");
        if (fullAccess.length !== 1) {
          throw new Error("Wallet tidak memberikan public key dan akun memiliki lebih dari satu atau nol FullAccess key. Deployment tetap diblokir demi keamanan.");
        }
        publicKey = fullAccess[0].public_key;
      }

      if (typeof publicKey !== "string" || !/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey)) {
        throw new Error("Public key akun tidak valid. Deployment tetap diblokir.");
      }

      connectedAccount = { ...connectedAccount, publicKey };
      accountNode.textContent = connectedAccount.accountId;
      setStatus(
        "Akun wkams.testnet terhubung. Public key diperoleh tanpa message-signing. Tinjau semua 5 tindakan sebelum menyetujui transaksi di Meteor Wallet.",
        "success",
      );
    } catch (error) {
      wallet = undefined;
      connectedAccount = undefined;
      accountNode.textContent = "Kunci akun belum terverifikasi";
      setStatus(`Wallet terhubung, tetapi deployment diblokir: ${error instanceof Error ? error.message : "verifikasi gagal"}`, "warning");
    }
    updateDeployEnabled();
  });
  connector.on("wallet:signOut", () => {
    wallet = undefined;
    connectedAccount = undefined;
    accountNode.textContent = "Not connected";
    setStatus("Wallet disconnected. No transaction was sent.");
    updateDeployEnabled();
  });
  await connector.connect();
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Opening the NEAR Testnet wallet selector…");
  try {
    if (!connector) await connectWallet();
    else await connector.connect();
  } catch (error) {
    setStatus(`Wallet connection failed: ${error instanceof Error ? error.message : "unknown error"}`, "warning");
  } finally {
    connectButton.disabled = false;
  }
});

wasmInput.addEventListener("change", async () => {
  wasmBytes = undefined;
  wasmSha256 = undefined;
  wasmStatus.textContent = "Checking selected file…";
  updateDeployEnabled();
  const file = wasmInput.files?.[0];
  if (!file) {
    wasmStatus.textContent = "No WASM selected.";
    return;
  }
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("File exceeds 10 MiB.");
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    wasmSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    wasmBytes = new Uint8Array(buffer);
    if (wasmSha256 !== EXPECTED_WASM_SHA256) {
      wasmBytes = undefined;
      throw new Error("SHA-256 mismatch. Do not deploy this file.");
    }
    wasmStatus.textContent = `Verified · ${file.name} · ${file.size.toLocaleString()} bytes · SHA-256 matches CI`;
    wasmStatus.dataset.kind = "success";
  } catch (error) {
    wasmStatus.textContent = error instanceof Error ? error.message : "WASM verification failed.";
    wasmStatus.dataset.kind = "warning";
  }
  updateDeployEnabled();
});

confirmation.addEventListener("change", updateDeployEnabled);

deployButton.addEventListener("click", async () => {
  deployButton.disabled = true;
  txNode.textContent = "";
  try {
    validateDeploymentInputs({
      accountId: connectedAccount?.accountId,
      publicKey: connectedAccount?.publicKey,
      wasmBytes,
      wasmSha256,
    });
    setStatus("Requesting one Testnet transaction. Check every action and fee in Meteor Wallet before approving.", "warning");
    const actions = buildDeploymentActions({ publicKey: connectedAccount.publicKey, wasmBytes });
    const outcome = await wallet.signAndSendTransaction({
      network: "testnet",
      signerId: EXPECTED_ACCOUNT_ID,
      receiverId: CONTRACT_ACCOUNT_ID,
      actions,
    });
    const hash = outcome?.transaction?.hash;
    setStatus("Wallet returned a transaction result. Verify final execution and contract state before treating deployment as complete.", "success");
    if (hash) {
      const link = document.createElement("a");
      link.href = `https://testnet.nearblocks.io/txns/${encodeURIComponent(hash)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `View Testnet transaction ${hash}`;
      txNode.replaceChildren(link);
    }
  } catch (error) {
    setStatus(`Deployment was not confirmed: ${error instanceof Error ? error.message : "unknown error"}. Check wallet and chain state before retrying.`, "warning");
  } finally {
    updateDeployEnabled();
  }
});

accountNode.textContent = "Not connected";
wasmStatus.textContent = `Expected SHA-256: ${EXPECTED_WASM_SHA256}`;
document.querySelector("#funding").textContent = "3 NEAR transferred to the new contract account; gas and storage costs are additional.";
document.querySelector("#contract").textContent = CONTRACT_ACCOUNT_ID;
document.querySelector("#initial-funding").textContent = `${Number(INITIAL_FUNDING_YOCTO) / 1e24} NEAR`;
setStatus("Ready. Connect Meteor Wallet, select the verified WASM file, then review the transaction.");
updateDeployEnabled();
