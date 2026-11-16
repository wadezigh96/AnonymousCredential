export const EXPECTED_ACCOUNT_ID = "wkams.testnet";
export const CONTRACT_ACCOUNT_ID = "registry.wkams.testnet";
export const EXPECTED_WASM_SHA256 = "10a80c1d86687259fd76f1c3a6f28789069d3a37dac88fc590539735db8f43e9";
export const INITIAL_FUNDING_YOCTO = "3000000000000000000000000";
export const INIT_GAS = "30000000000000"; // 30 Tgas
export const MAX_WASM_BYTES = 10 * 1024 * 1024;

export function validateDeploymentInputs({ accountId, publicKey, wasmBytes, wasmSha256 }) {
  if (accountId !== EXPECTED_ACCOUNT_ID) throw new Error("Wallet account must be exactly wkams.testnet.");
  if (typeof publicKey !== "string" || !/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey)) {
    throw new Error("Wallet did not provide a valid NEAR public key. Reconnect; never paste a private key.");
  }
  if (!(wasmBytes instanceof Uint8Array) || wasmBytes.length < 8 || wasmBytes.length > MAX_WASM_BYTES) {
    throw new Error("Select the verified ANONYMESH issuer-registry WASM file (8 bytes to 10 MiB).");
  }
  if (wasmBytes[0] !== 0 || wasmBytes[1] !== 97 || wasmBytes[2] !== 115 || wasmBytes[3] !== 109) {
    throw new Error("Selected file is not a WebAssembly module.");
  }
  if (wasmSha256 !== EXPECTED_WASM_SHA256) {
    throw new Error("WASM SHA-256 does not match the CI artifact. Deployment blocked.");
  }
}

export function buildDeploymentActions({ publicKey, wasmBytes }) {
  if (!publicKey || !(wasmBytes instanceof Uint8Array)) throw new Error("Validated wallet key and WASM bytes are required.");
  return [
    { type: "CreateAccount" },
    { type: "Transfer", params: { deposit: INITIAL_FUNDING_YOCTO } },
    {
      type: "AddKey",
      params: {
        publicKey,
        accessKey: { permission: "FullAccess" },
      },
    },
    { type: "DeployContract", params: { code: wasmBytes } },
    {
      type: "FunctionCall",
      params: {
        methodName: "new",
        args: { owner_id: EXPECTED_ACCOUNT_ID },
        gas: INIT_GAS,
        deposit: "0",
      },
    },
  ];
}
