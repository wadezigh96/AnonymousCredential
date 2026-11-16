import { NearConnector } from "@hot-labs/near-connect";
import { EXPECTED_ACCOUNT_ID, inspectAccount } from "./account-check.js";
import "./style.css";

const connectButton = document.querySelector("#connect");
const statusNode = document.querySelector("#status");
const accountPanel = document.querySelector("#account-panel");
const accountNode = document.querySelector("#account");
const matchNode = document.querySelector("#match");

let connector;
let connected = false;

function setStatus(message, kind = "neutral") {
  statusNode.textContent = message;
  statusNode.dataset.kind = kind;
}

function renderAccount(accountId) {
  const result = inspectAccount(accountId);
  accountPanel.hidden = !result.connected;
  accountNode.textContent = result.accountId ?? "No account returned";

  if (result.matchesExpected) {
    matchNode.textContent = "Account matches wkams.testnet. Read-only preflight passed; no transaction was sent.";
    matchNode.dataset.kind = "success";
    setStatus("Wallet connected on the Testnet connector. Account matches the configured target.", "success");
  } else {
    matchNode.textContent = "This is not the configured deployment account. Do not use it for the ANONYMESH deployment.";
    matchNode.dataset.kind = "warning";
    setStatus("Wallet connected, but the selected account does not match wkams.testnet.", "warning");
  }
}

async function initializeConnector() {
  connector = new NearConnector({
    network: "testnet",
    features: { testnet: true },
  });

  connector.on("wallet:signIn", ({ accounts }) => {
    connected = true;
    renderAccount(accounts?.[0]?.accountId);
  });

  connector.on("wallet:signOut", () => {
    connected = false;
    accountPanel.hidden = true;
    accountNode.textContent = "";
    matchNode.textContent = "";
    setStatus("Wallet disconnected. No transaction was sent.", "neutral");
  });

  // Wallet integrations are loaded from the connector manifest asynchronously.
  await connector.whenManifestLoaded;
}

connectButton.addEventListener("click", async () => {
  connectButton.disabled = true;
  setStatus("Opening the NEAR Testnet wallet selector…", "neutral");

  try {
    if (!connector) await initializeConnector();
    await connector.connect();
    if (!connected) {
      setStatus("Wallet selection opened. Complete the connection in your wallet; this page has not requested a transaction.", "neutral");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown wallet connection error";
    setStatus(`Connection was not completed: ${message}`, "warning");
  } finally {
    connectButton.disabled = false;
  }
});

setStatus(`Ready for a read-only connection to NEAR Testnet. Expected account: ${EXPECTED_ACCOUNT_ID}.`);
