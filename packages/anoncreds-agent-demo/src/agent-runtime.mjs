import {
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
  verify as ed25519Verify,
} from "node:crypto";
import {
  CapabilityVerificationError,
  capabilityDigest,
  verifyCapabilityChain,
} from "./capability.mjs";
import { MemoryAuthorizationStore } from "./authorization-store.mjs";

const REQUEST_DOMAIN = Buffer.from("ANONYMESH_AGENT_REQUEST_V1\0", "utf8");
const KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

function fail(code) {
  throw new CapabilityVerificationError(code);
}

function decode(value, length, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) fail(code);
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== length || bytes.toString("base64url") !== value) fail(code);
  return bytes;
}

function keyObject(input) {
  if (input && typeof input === "object" && input.type === "private") {
    if (input.asymmetricKeyType !== "ed25519") fail("INVALID_PRIVATE_KEY_TYPE");
    return input;
  }
  let key;
  try {
    key = createPrivateKey(input);
  } catch {
    fail("INVALID_PRIVATE_KEY");
  }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    fail("INVALID_PRIVATE_KEY_TYPE");
  }
  return key;
}

function publicKeyFromRaw(raw) {
  const bytes = decode(raw, KEY_BYTES, "INVALID_DELEGATE_KEY");
  return createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), bytes]),
    format: "der",
    type: "spki",
  });
}

function transcript({ nonce, capabilityDigest: digest, audience, action, resource, delegateKey }) {
  for (const [field, value] of Object.entries({ nonce, digest, audience, action, resource, delegateKey })) {
    if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value) > 1024) {
      fail("INVALID_REQUEST_" + field.toUpperCase());
    }
  }
  decode(delegateKey, KEY_BYTES, "INVALID_DELEGATE_KEY");
  return Buffer.concat([
    REQUEST_DOMAIN,
    Buffer.from(JSON.stringify([nonce, digest, audience, action, resource, delegateKey]), "utf8"),
  ]);
}

export function createAgentRequestProof({ challenge, capabilityChain, privateKey }) {
  if (!Array.isArray(capabilityChain) || capabilityChain.length === 0) fail("EMPTY_CHAIN");
  const leaf = capabilityChain[capabilityChain.length - 1];
  const digest = capabilityDigest(leaf);
  const key = keyObject(privateKey);
  const publicJwk = createPublicKey(key).export({ format: "jwk" });
  if (publicJwk.x !== leaf.delegateKey) fail("SIGNER_DOES_NOT_MATCH_DELEGATE");
  if (challenge?.capabilityDigest !== digest) fail("CHALLENGE_CAPABILITY_MISMATCH");
  if (challenge?.task !== leaf.action || challenge?.audience !== leaf.audience) {
    fail("CHALLENGE_SCOPE_MISMATCH");
  }
  const fields = {
    nonce: challenge.nonce,
    capabilityDigest: digest,
    audience: challenge.audience,
    action: leaf.action,
    resource: leaf.resource,
    delegateKey: leaf.delegateKey,
  };
  const signature = ed25519Sign(null, transcript(fields), key);
  return Object.freeze({ ...fields, signature: signature.toString("base64url") });
}

/**
 * In-process authorization gate for the demo runtime.
 * Signature/scope/replay/quota checks are synchronous, so state mutation is
 * atomic within one Node.js event loop. State is intentionally in-memory:
 * it is not durable or safe across multiple verifier processes.
 */
export class AgentAuthorizationRuntime {
  #usedNonces = new Set();
  #quotaUsed = new Map();

  authorizeAndConsume({ chain, trustedRootIssuer, challenge, proof, expected, now = Math.floor(Date.now() / 1000) }) {
    if (!challenge || typeof challenge.nonce !== "string") fail("INVALID_CHALLENGE");
    if (this.#usedNonces.has(challenge.nonce)) fail("CHALLENGE_REPLAY");

    const result = verifyCapabilityChain({
      chain,
      trustedRootIssuer,
      expected: {
        ...expected,
        audience: challenge.audience,
        action: challenge.task,
      },
      now,
    });

    const leaf = chain[chain.length - 1];
    const digest = capabilityDigest(leaf);
    if (challenge.capabilityDigest !== digest) fail("CHALLENGE_CAPABILITY_MISMATCH");
    if (!proof || proof.nonce !== challenge.nonce) fail("REQUEST_NONCE_MISMATCH");
    if (proof.capabilityDigest !== digest) fail("REQUEST_CAPABILITY_MISMATCH");
    if (proof.audience !== challenge.audience) fail("REQUEST_AUDIENCE_MISMATCH");
    if (proof.action !== challenge.task || proof.action !== result.action) fail("REQUEST_ACTION_MISMATCH");
    if (proof.resource !== result.resource) fail("REQUEST_RESOURCE_MISMATCH");
    if (proof.delegateKey !== result.delegateKey) fail("REQUEST_DELEGATE_MISMATCH");

    const signature = decode(proof.signature, SIGNATURE_BYTES, "INVALID_REQUEST_SIGNATURE");
    const valid = ed25519Verify(
      null,
      transcript(proof),
      publicKeyFromRaw(result.delegateKey),
      signature,
    );
    if (!valid) fail("INVALID_REQUEST_SIGNATURE");

    const used = this.#quotaUsed.get(digest) ?? 0;
    if (used >= result.remainingQuota) fail("CAPABILITY_QUOTA_EXHAUSTED");

    // Mutations occur only after every validation has succeeded.
    this.#usedNonces.add(challenge.nonce);
    this.#quotaUsed.set(digest, used + 1);
    return Object.freeze({
      authorized: true,
      capabilityDigest: digest,
      action: result.action,
      resource: result.resource,
      remainingQuota: result.remainingQuota - used - 1,
    });
  }
}
