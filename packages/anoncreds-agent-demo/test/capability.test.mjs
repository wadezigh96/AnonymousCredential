import test from "node:test";
import assert from "node:assert/strict";
import { createPublicKey, generateKeyPairSync, verify as ed25519Verify } from "node:crypto";
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

test("rejects delegated audience, action, and resource escalation even when the child is correctly signed", () => {
  const f = fixture();
  const escalations = [
    { field: "audience", value: "agent-c.example", code: "AUDIENCE_ESCALATION" },
    { field: "action", value: "transfer:funds", code: "ACTION_ESCALATION" },
    { field: "resource", value: "wallet:all", code: "RESOURCE_ESCALATION" },
  ];

  for (const escalation of escalations) {
    const child = makeCapability({
      issuer: f.agentA,
      delegate: f.agentB,
      parentDigest: capabilityDigest(f.chain[0]),
      expiresAt: now + 200,
      quota: 5,
      [escalation.field]: escalation.value,
    });
    assert.throws(
      () => verifyCapabilityChain({
        chain: [f.chain[0], child],
        trustedRootIssuer: f.rootIssuer.publicKey,
        expected,
        now,
      }),
      error => error.code === escalation.code,
      escalation.field + " escalation must be rejected",
    );
  }
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

test("accepts PEM private-key input", () => {
  const issuer = keys();
  const delegate = keys();
  const pem = issuer.privateKey.export({ format: "pem", type: "pkcs8" });
  const capability = signCapability({
    parentDigest: null,
    issuerKey: issuer.publicKey,
    delegateKey: delegate.publicKey,
    audience: expected.audience,
    action: expected.action,
    resource: expected.resource,
    expiresAt: now + 60,
    quota: 1,
  }, pem);
  assert.equal(capability.signature.length > 0, true);
});

test("rejects malformed and non-Ed25519 private-key input clearly", () => {
  const issuer = keys();
  const delegate = keys();
  const fields = {
    parentDigest: null,
    issuerKey: issuer.publicKey,
    delegateKey: delegate.publicKey,
    audience: expected.audience,
    action: expected.action,
    resource: expected.resource,
    expiresAt: now + 60,
    quota: 1,
  };
  assert.throws(
    () => signCapability(fields, "not-a-private-key"),
    (error) => error instanceof CapabilityVerificationError && error.code === "INVALID_PRIVATE_KEY",
  );

  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  assert.throws(
    () => signCapability(fields, rsa.privateKey),
    (error) => error instanceof CapabilityVerificationError && error.code === "INVALID_PRIVATE_KEY_TYPE",
  );
});

test("uses a real NUL byte for domain separation", () => {
  const issuer = keys();
  const delegate = keys();
  const fields = {
    parentDigest: null,
    issuerKey: issuer.publicKey,
    delegateKey: delegate.publicKey,
    audience: expected.audience,
    action: expected.action,
    resource: expected.resource,
    expiresAt: now + 60,
    quota: 1,
  };
  const capability = signCapability(fields, issuer.privateKey);
  const transcript = [
    fields.parentDigest,
    fields.issuerKey,
    fields.delegateKey,
    fields.audience,
    fields.action,
    fields.resource,
    fields.expiresAt,
    fields.quota,
  ];
  const message = Buffer.concat([
    Buffer.from("ANONYMESH_DELEGATED_CAPABILITY_V1\0", "utf8"),
    Buffer.from(JSON.stringify(transcript), "utf8"),
  ]);
  const rawPublicKey = Buffer.from(issuer.publicKey, "base64url");
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawPublicKey]),
    format: "der",
    type: "spki",
  });
  assert.equal(ed25519Verify(null, message, publicKey, Buffer.from(capability.signature, "base64url")), true);
});
