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
        setStatus("Wallet connected, but selected account is not wkams.testnet. Deployment blocked.", "warning");
        accountNode.textContent = accounts?.map((item) => item.accountId).join(", ") || "No account returned";
        updateDeployEnabled();
        return;
      }

      const refreshed = await wallet.getAccounts();
      const walletAccount = refreshed.find((account) => account.accountId === EXPECTED_ACCOUNT_ID);
      let walletPublicKey = walletAccount?.publicKey ?? connectedAccount.publicKey;

      // If the wallet omits publicKey, request a NEP-413 proof-of-control.
      // Never guess the signer from the chain's access-key list.
      if (!walletPublicKey) {
        if (typeof wallet.signMessage !== "function") {
          throw new Error("This wallet does not expose safe message signing. Reconnect with a compatible Meteor Wallet.");
        }
        const nonce = crypto.getRandomValues(new Uint8Array(32));
        const signed = await wallet.signMessage({
          message: "ANONYMESH Testnet deployer signer-key verification. This signs no transaction and spends no funds.",
          recipient: window.location.hostname,
          nonce,
          network: "testnet",
        });
        if (signed?.accountId !== EXPECTED_ACCOUNT_ID || typeof signed?.publicKey !== "string") {
          throw new Error("Wallet did not return a signer identity proof for wkams.testnet.");
        }
        walletPublicKey = signed.publicKey;
      }

      const response = await fetch("https://rpc.testnet.near.org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "anonymesh-readonly-key-check",
          method: "query",
          params: {
            request_type: "view_access_key",
            finality: "final",
            account_id: EXPECTED_ACCOUNT_ID,
            public_key: walletPublicKey,
          },
        }),
      });
      if (!response.ok) throw new Error("NEAR Testnet RPC could not be reached.");
      const rpc = await response.json();
      if (rpc.error || rpc.result?.permission !== "FullAccess") {
        throw new Error("The wallet signer key is not a verified FullAccess key on wkams.testnet.");
      }

      const verifiedPublicKey = walletPublicKey;

      accountNode.textContent = connectedAccount.accountId;
      setStatus(
        "Correct Testnet account and signer key verified. Review all five actions and approve only in Meteor Wallet.",
        "success",
      );
    } catch (error) {
      wallet = undefined;
      connectedAccount = undefined;
      accountNode.textContent = "Account key could not be verified";
      setStatus(`Wallet connected, but deployment is blocked: ${error instanceof Error ? error.message : "key verification failed"}`, "warning");
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
