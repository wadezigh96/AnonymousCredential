import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { capabilityDigest, signCapability } from "../src/capability.mjs";
import { SqliteAuthorizationStore } from "../src/authorization-store.mjs";
import {
  AgentAuthorizationRuntime,
  createAgentRequestProof,
} from "../src/agent-runtime.mjs";

const now = 1_800_000_000;
const audience = "agent-b.anonymesh.test";
const action = "read:weather";
const resource = "weather:global";

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey.export({ format: "jwk" }).x,
  };
}

function fixture({ quota = 2 } = {}) {
  const issuer = keyPair();
  const agentA = keyPair();
  const leaf = signCapability({
    parentDigest: null,
    issuerKey: issuer.publicKey,
    delegateKey: agentA.publicKey,
    audience,
    action,
    resource,
    expiresAt: now + 600,
    quota,
  }, issuer.privateKey);
  const chain = [leaf];
  const challenge = {
    nonce: "anonymesh-test-nonce-001",
    audience,
    task: action,
    capabilityDigest: capabilityDigest(leaf),
  };
  const proof = createAgentRequestProof({
    challenge,
    capabilityChain: chain,
    privateKey: agentA.privateKey,
  });
  return { issuer, agentA, chain, challenge, proof };
}

test("authorizes a capability-bound Agent A request and consumes one quota unit", () => {
  const f = fixture({ quota: 2 });
  const runtime = new AgentAuthorizationRuntime();
  const result = runtime.authorizeAndConsume({
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    proof: f.proof,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  });
  assert.deepEqual(result, {
    authorized: true,
    capabilityDigest: f.challenge.capabilityDigest,
    action,
    resource,
    remainingQuota: 1,
  });
});

test("rejects replay without consuming another quota unit", () => {
  const f = fixture({ quota: 2 });
  const runtime = new AgentAuthorizationRuntime();
  const args = {
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    proof: f.proof,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  };
  runtime.authorizeAndConsume(args);
  assert.throws(() => runtime.authorizeAndConsume(args), error => error.code === "CHALLENGE_REPLAY");
});

test("rejects a forged request signature and leaves nonce available for a valid proof", () => {
  const f = fixture();
  const runtime = new AgentAuthorizationRuntime();
  const args = {
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  };
  assert.throws(
    () => runtime.authorizeAndConsume({ ...args, proof: { ...f.proof, signature: Buffer.alloc(64).toString("base64url") } }),
    error => error.code === "INVALID_REQUEST_SIGNATURE",
  );
  assert.equal(runtime.authorizeAndConsume({ ...args, proof: f.proof }).authorized, true);
});

test("rejects challenge scope and capability digest substitution", () => {
  const f = fixture();
  const runtime = new AgentAuthorizationRuntime();
  assert.throws(() => runtime.authorizeAndConsume({
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: { ...f.challenge, task: "transfer:funds" },
    proof: f.proof,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  }), error => error.code === "REQUEST_ACTION_MISMATCH" || error.code === "CHALLENGE_SCOPE_MISMATCH");
  assert.throws(() => createAgentRequestProof({
    challenge: { ...f.challenge, capabilityDigest: "substituted-digest" },
    capabilityChain: f.chain,
    privateKey: f.agentA.privateKey,
  }), error => error.code === "CHALLENGE_CAPABILITY_MISMATCH");
});

test("rejects a proof signed by a key other than the capability delegate", () => {
  const f = fixture();
  const attacker = keyPair();
  const forged = { ...f.proof, delegateKey: attacker.publicKey };
  const runtime = new AgentAuthorizationRuntime();
  assert.throws(() => runtime.authorizeAndConsume({
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    proof: forged,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  }), error => error.code === "REQUEST_DELEGATE_MISMATCH");
});

test("enforces capability quota across distinct challenges", () => {
  const f = fixture({ quota: 1 });
  const runtime = new AgentAuthorizationRuntime();
  const expected = { audience, action, resource, delegateKey: f.agentA.publicKey };
  runtime.authorizeAndConsume({
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    proof: f.proof,
    expected,
    now,
  });
  const nextChallenge = { ...f.challenge, nonce: "anonymesh-test-nonce-002" };
  const nextProof = createAgentRequestProof({
    challenge: nextChallenge,
    capabilityChain: f.chain,
    privateKey: f.agentA.privateKey,
  });
  assert.throws(() => runtime.authorizeAndConsume({
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: nextChallenge,
    proof: nextProof,
    expected,
    now,
  }), error => error.code === "CAPABILITY_QUOTA_EXHAUSTED");
});


test("Agent B executes the guarded tool only after successful authorization", async () => {
  const f = fixture();
  const runtime = new AgentAuthorizationRuntime();
  let executions = 0;
  const args = {
    chain: f.chain,
    trustedRootIssuer: f.issuer.publicKey,
    challenge: f.challenge,
    proof: f.proof,
    expected: { audience, action, resource, delegateKey: f.agentA.publicKey },
    now,
  };
  const result = await runtime.authorizeAndExecute(args, async scope => {
    executions += 1;
    assert.deepEqual(scope, {
      action,
      resource,
      capabilityDigest: f.challenge.capabilityDigest,
    });
    return { fixture: "sunny" };
  });
  assert.equal(result.result.fixture, "sunny");
  assert.equal(executions, 1);

  const f2 = fixture();
  const invalid = { ...f2.proof, signature: Buffer.alloc(64).toString("base64url") };
  await assert.rejects(
    runtime.authorizeAndExecute({ ...args, challenge: f2.challenge, chain: f2.chain, proof: invalid }, async () => {
      executions += 1;
    }),
    error => error.code === "INVALID_REQUEST_SIGNATURE",
  );
  assert.equal(executions, 1);
});

test("SQLite replay and quota state survives store restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-auth-"));
  const filename = join(directory, "authorization.sqlite");
  try {
    let store = new SqliteAuthorizationStore({ filename });
    assert.deepEqual(store.consume({ nonce: "nonce-1", digest: "digest-1", quota: 2 }), { remainingQuota: 1 });
    store.close();

    store = new SqliteAuthorizationStore({ filename });
    assert.throws(
      () => store.consume({ nonce: "nonce-1", digest: "digest-1", quota: 2 }),
      error => error.code === "CHALLENGE_REPLAY",
    );
    assert.deepEqual(store.consume({ nonce: "nonce-2", digest: "digest-1", quota: 2 }), { remainingQuota: 0 });
    assert.throws(
      () => store.consume({ nonce: "nonce-3", digest: "digest-1", quota: 2 }),
      error => error.code === "CAPABILITY_QUOTA_EXHAUSTED",
    );
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
