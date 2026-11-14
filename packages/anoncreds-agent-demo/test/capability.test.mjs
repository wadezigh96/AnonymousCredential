import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  CapabilityVerificationError,
  capabilityDigest,
  signCapability,
  verifyCapabilityChain,
} from "../src/capability.mjs";

const now = 1_800_000_000;

function keys() {
  const pair = generateKeyPairSync("ed25519");
  const jwk = pair.publicKey.export({ format: "jwk" });
  return { privateKey: pair.privateKey, publicKey: jwk.x };
}

function makeCapability({ issuer, delegate, parentDigest = null, expiresAt = now + 600, quota = 20, action = "read:weather", resource = "weather:singapore", audience = "agent-b.example" }) {
  return signCapability({
    parentDigest,
    issuerKey: issuer.publicKey,
    delegateKey: delegate.publicKey,
    audience,
    action,
    resource,
    expiresAt,
    quota,
  }, issuer.privateKey);
}

function fixture() {
  const rootIssuer = keys();
  const agentA = keys();
  const agentB = keys();
  const root = makeCapability({ issuer: rootIssuer, delegate: agentA, expiresAt: now + 900, quota: 100 });
  const leaf = makeCapability({
    issuer: agentA,
    delegate: agentB,
    parentDigest: capabilityDigest(root),
    expiresAt: now + 300,
    quota: 10,
  });
  return { rootIssuer, agentA, agentB, chain: [root, leaf] };
}

const expected = {
  audience: "agent-b.example",
  action: "read:weather",
  resource: "weather:singapore",
};

test("accepts a valid signed root and attenuated delegation chain", () => {
  const f = fixture();
  const result = verifyCapabilityChain({
    chain: f.chain,
    trustedRootIssuer: f.rootIssuer.publicKey,
    expected: { ...expected, delegateKey: f.agentB.publicKey },
    now,
  });
  assert.equal(result.valid, true);
  assert.equal(result.delegateKey, f.agentB.publicKey);
  assert.equal(result.remainingQuota, 10);
  assert.equal(result.digest, capabilityDigest(f.chain[1]));
});

test("rejects a forged capability signature", () => {
  const f = fixture();
  const forged = { ...f.chain[1], action: "transfer:funds" };
  assert.throws(
    () => verifyCapabilityChain({ chain: [f.chain[0], forged], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error instanceof CapabilityVerificationError && error.code === "INVALID_SIGNATURE",
  );
});

test("rejects a changed parent digest", () => {
  const f = fixture();
  const changed = { ...f.chain[1], parentDigest: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
  assert.throws(
    () => verifyCapabilityChain({ chain: [f.chain[0], changed], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error.code === "INVALID_SIGNATURE",
  );
});

test("rejects a delegation signed by the wrong parent key", () => {
  const f = fixture();
  const impostor = keys();
  const wrongChild = makeCapability({
    issuer: impostor,
    delegate: f.agentB,
    parentDigest: capabilityDigest(f.chain[0]),
    expiresAt: now + 200,
    quota: 5,
  });
  assert.throws(
    () => verifyCapabilityChain({ chain: [f.chain[0], wrongChild], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error.code === "WRONG_DELEGATOR",
  );
});

test("rejects audience, action, and resource mismatches", () => {
  const f = fixture();
  for (const mismatch of [
    { ...expected, audience: "agent-c.example" },
    { ...expected, action: "transfer:funds" },
    { ...expected, resource: "weather:global" },
  ]) {
    assert.throws(
      () => verifyCapabilityChain({ chain: f.chain, trustedRootIssuer: f.rootIssuer.publicKey, expected: mismatch, now }),
      (error) => error.code.startsWith("REQUEST_") && error.code.endsWith("_MISMATCH"),
    );
  }
});

test("rejects an expired capability", () => {
  const f = fixture();
  const expired = makeCapability({
    issuer: f.rootIssuer,
    delegate: f.agentA,
    expiresAt: now,
    quota: 10,
  });
  assert.throws(
    () => verifyCapabilityChain({ chain: [expired], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error.code === "CAPABILITY_EXPIRED",
  );
});

test("rejects expiry and quota escalation", () => {
  const f = fixture();
  const expiryEscalation = makeCapability({
    issuer: f.agentA,
    delegate: f.agentB,
    parentDigest: capabilityDigest(f.chain[0]),
    expiresAt: now + 901,
    quota: 5,
  });
  assert.throws(
    () => verifyCapabilityChain({ chain: [f.chain[0], expiryEscalation], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error.code === "EXPIRY_ESCALATION",
  );

  const quotaEscalation = makeCapability({
    issuer: f.agentA,
    delegate: f.agentB,
    parentDigest: capabilityDigest(f.chain[0]),
    expiresAt: now + 200,
    quota: 101,
  });
  assert.throws(
    () => verifyCapabilityChain({ chain: [f.chain[0], quotaEscalation], trustedRootIssuer: f.rootIssuer.publicKey, expected, now }),
    (error) => error.code === "QUOTA_ESCALATION",
  );
});

test("rejects a capability addressed to a different delegated key", () => {
  const f = fixture();
  const other = keys();
  assert.throws(
    () => verifyCapabilityChain({
      chain: f.chain,
      trustedRootIssuer: f.rootIssuer.publicKey,
      expected: { ...expected, delegateKey: other.publicKey },
      now,
    }),
    (error) => error.code === "DELEGATE_KEY_MISMATCH",
  );
});

test("rejects an untrusted root issuer", () => {
  const f = fixture();
  const otherRoot = keys();
  assert.throws(
    () => verifyCapabilityChain({ chain: f.chain, trustedRootIssuer: otherRoot.publicKey, expected, now }),
    (error) => error.code === "INVALID_ROOT",
  );
});
