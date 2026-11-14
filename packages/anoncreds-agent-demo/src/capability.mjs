import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as ed25519Sign,
  verify as ed25519Verify,
} from "node:crypto";

const DOMAIN = Buffer.from("ANONYMESH_DELEGATED_CAPABILITY_V1\0", "utf8");
const MAX_CHAIN_LENGTH = 9;
const KEY_BYTES = 32;
const SIGNATURE_BYTES = 64;

export class CapabilityVerificationError extends Error {
  constructor(code) {
    super(code);
    this.name = "CapabilityVerificationError";
    this.code = code;
  }
}

function fail(code) {
  throw new CapabilityVerificationError(code);
}

function decode(value, expectedLength, code) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) fail(code);
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== expectedLength || bytes.toString("base64url") !== value) fail(code);
  return bytes;
}

function validateFields(capability) {
  if (!capability || typeof capability !== "object") fail("MALFORMED_CAPABILITY");
  for (const field of ["audience", "action", "resource"]) {
    if (typeof capability[field] !== "string" || capability[field].length === 0 || Buffer.byteLength(capability[field]) > 512) {
      fail("INVALID_" + field.toUpperCase());
    }
  }
  if (!Number.isSafeInteger(capability.expiresAt) || capability.expiresAt <= 0) fail("INVALID_EXPIRY");
  if (!Number.isSafeInteger(capability.quota) || capability.quota <= 0) fail("INVALID_QUOTA");
  decode(capability.issuerKey, KEY_BYTES, "INVALID_ISSUER_KEY");
  decode(capability.delegateKey, KEY_BYTES, "INVALID_DELEGATE_KEY");
  if (capability.parentDigest !== null) decode(capability.parentDigest, 32, "INVALID_PARENT_DIGEST");
}

function unsignedBytes(capability) {
  validateFields(capability);
  const transcript = [
    capability.parentDigest,
    capability.issuerKey,
    capability.delegateKey,
    capability.audience,
    capability.action,
    capability.resource,
    capability.expiresAt,
    capability.quota,
  ];
  return Buffer.concat([DOMAIN, Buffer.from(JSON.stringify(transcript), "utf8")]);
}

function publicKeyObject(rawKey) {
  const raw = decode(rawKey, KEY_BYTES, "INVALID_PUBLIC_KEY");
  const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({ key: Buffer.concat([spkiPrefix, raw]), format: "der", type: "spki" });
}

function privateKeyObject(value) {
  if (value && typeof value === "object" && value.type === "private") {
    if (value.asymmetricKeyType !== "ed25519") fail("INVALID_PRIVATE_KEY_TYPE");
    return value;
  }

  if (typeof value !== "string" && !Buffer.isBuffer(value) && !ArrayBuffer.isView(value)) {
    fail("INVALID_PRIVATE_KEY");
  }

  let key;
  try {
    key = createPrivateKey(value);
  } catch {
    fail("INVALID_PRIVATE_KEY");
  }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    fail("INVALID_PRIVATE_KEY_TYPE");
  }
  return key;
}

export function capabilityDigest(capability) {
  validateFields(capability);
  const signature = decode(capability.signature, SIGNATURE_BYTES, "INVALID_SIGNATURE_ENCODING");
  const canonical = Buffer.concat([unsignedBytes(capability), signature]);
  return createHash("sha256").update(canonical).digest("base64url");
}

export function signCapability(fields, privateKeyInput) {
  const privateKey = privateKeyObject(privateKeyInput);
  const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });
  const derivedIssuer = publicJwk.x;
  if (derivedIssuer !== fields.issuerKey) fail("SIGNER_DOES_NOT_MATCH_ISSUER");
  const signature = ed25519Sign(null, unsignedBytes(fields), privateKey);
  return Object.freeze({ ...fields, signature: signature.toString("base64url") });
}

/**
 * Validates every Ed25519 delegation edge and the final capability scope.
 * This function does not consume quota or execute an action.
 */
export function verifyCapabilityChain({
  chain,
  trustedRootIssuer,
  expected,
  now = Math.floor(Date.now() / 1000),
}) {
  if (!Array.isArray(chain) || chain.length === 0) fail("EMPTY_CHAIN");
  if (chain.length > MAX_CHAIN_LENGTH) fail("DELEGATION_DEPTH_EXCEEDED");
  decode(trustedRootIssuer, KEY_BYTES, "INVALID_TRUSTED_ROOT_KEY");
  if (!Number.isSafeInteger(now) || now < 0) fail("INVALID_NOW");

  const root = chain[0];
  if (root.parentDigest !== null || root.issuerKey !== trustedRootIssuer) fail("INVALID_ROOT");

  for (let index = 0; index < chain.length; index += 1) {
    const current = chain[index];
    validateFields(current);
    if (current.expiresAt <= now) fail("CAPABILITY_EXPIRED");

    const signature = decode(current.signature, SIGNATURE_BYTES, "INVALID_SIGNATURE_ENCODING");
    const validSignature = ed25519Verify(
      null,
      unsignedBytes(current),
      publicKeyObject(current.issuerKey),
      signature,
    );
    if (!validSignature) fail("INVALID_SIGNATURE");

    if (index === 0) continue;
    const parent = chain[index - 1];
    if (current.issuerKey !== parent.delegateKey) fail("WRONG_DELEGATOR");
    if (current.parentDigest !== capabilityDigest(parent)) fail("BROKEN_PARENT_LINK");
    if (current.audience !== parent.audience) fail("AUDIENCE_ESCALATION");
    if (current.action !== parent.action) fail("ACTION_ESCALATION");
    if (current.resource !== parent.resource) fail("RESOURCE_ESCALATION");
    if (current.expiresAt > parent.expiresAt) fail("EXPIRY_ESCALATION");
    if (current.quota > parent.quota) fail("QUOTA_ESCALATION");
  }

  const leaf = chain[chain.length - 1];
  for (const field of ["audience", "action", "resource"]) {
    if (expected?.[field] !== leaf[field]) fail("REQUEST_" + field.toUpperCase() + "_MISMATCH");
  }
  if (expected?.delegateKey && expected.delegateKey !== leaf.delegateKey) fail("DELEGATE_KEY_MISMATCH");

  return Object.freeze({
    valid: true,
    digest: capabilityDigest(leaf),
    delegateKey: leaf.delegateKey,
    audience: leaf.audience,
    action: leaf.action,
    resource: leaf.resource,
    expiresAt: leaf.expiresAt,
    remainingQuota: leaf.quota,
  });
}
