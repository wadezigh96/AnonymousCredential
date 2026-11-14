import { createHash } from "node:crypto";

const KEY_BYTES = 32;
const KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

/** AnonCreds 1.0 canonical raw-to-encoded attribute conversion. */
export function encodeAnonCredsAttribute(raw) {
  const value = String(raw);
  if (/^-?(0|[1-9][0-9]*)$/.test(value)) return BigInt(value).toString(10);
  const digest = createHash("sha256").update(Buffer.from(value, "utf8")).digest();
  return BigInt("0x" + digest.toString("hex")).toString(10);
}

export function validateAgentPublicKey(value) {
  if (typeof value !== "string" || !KEY_PATTERN.test(value)) fail("INVALID_AGENT_PUBLIC_KEY");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== KEY_BYTES || bytes.toString("base64url") !== value) fail("INVALID_AGENT_PUBLIC_KEY");
  return value;
}

/** Extracts the revealed key only after checking its raw/encoded binding. */
export function extractCredentialAgentPublicKey(input) {
  let presentation = input;
  if (typeof input === "string") {
    try { presentation = JSON.parse(input); }
    catch { fail("MALFORMED_PRESENTATION_JSON"); }
  }
  const attr = presentation?.requested_proof?.revealed_attrs?.agent_key_ref;
  if (!attr || typeof attr.raw !== "string" || typeof attr.encoded !== "string") fail("MISSING_REVEALED_AGENT_KEY");
  const key = validateAgentPublicKey(attr.raw);
  if (attr.encoded !== encodeAnonCredsAttribute(key)) fail("AGENT_KEY_ENCODING_MISMATCH");
  return key;
}
