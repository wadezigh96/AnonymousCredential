import test from "node:test";
import assert from "node:assert/strict";
import {
  EXPECTED_ACCOUNT_ID,
  EXPECTED_WASM_SHA256,
  CONTRACT_ACCOUNT_ID,
  INITIAL_FUNDING_YOCTO,
  validateDeploymentInputs,
  buildDeploymentActions,
} from "./deploy-plan.js";

const key = "ed25519:11111111111111111111111111111111";
const wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);

test("pins the intended Testnet accounts and verified CI WASM digest", () => {
  assert.equal(EXPECTED_ACCOUNT_ID, "wkams.testnet");
  assert.equal(CONTRACT_ACCOUNT_ID, "registry.wkams.testnet");
  assert.match(EXPECTED_WASM_SHA256, /^[a-f0-9]{64}$/);
});

test("blocks a wrong wallet account, missing key, invalid WASM, or wrong digest", () => {
  const valid = { accountId: EXPECTED_ACCOUNT_ID, publicKey: key, wasmBytes: wasm, wasmSha256: EXPECTED_WASM_SHA256 };
  assert.throws(() => validateDeploymentInputs({ ...valid, accountId: "other.testnet" }), /exactly wkams/);
  assert.throws(() => validateDeploymentInputs({ ...valid, publicKey: "" }), /public key/);
  assert.throws(() => validateDeploymentInputs({ ...valid, wasmSha256: "0".repeat(64) }), /SHA-256/);
  assert.throws(() => validateDeploymentInputs({ ...valid, wasmBytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) }), /WebAssembly/);
});

test("builds one ordered create, fund, key, deploy, and init transaction", () => {
  const actions = buildDeploymentActions({ publicKey: key, wasmBytes: wasm });
  assert.deepEqual(actions.map((action) => action.type), [
    "CreateAccount", "Transfer", "AddKey", "DeployContract", "FunctionCall",
  ]);
  assert.equal(actions[1].params.deposit, INITIAL_FUNDING_YOCTO);
  assert.equal(actions[2].params.publicKey, key);
  assert.equal(actions[3].params.code, wasm);
  assert.deepEqual(actions[4].params.args, { owner_id: EXPECTED_ACCOUNT_ID });
  assert.equal(actions[4].params.methodName, "new");
  assert.equal(actions[4].params.deposit, "0");
});
