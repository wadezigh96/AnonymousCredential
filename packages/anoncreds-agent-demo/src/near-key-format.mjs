const PREFIX = "ed25519:";
const KEY_BYTES = 32;
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const INDEX = new Map([...ALPHABET].map((char, index) => [char, index]));

function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function encodeNearEd25519PublicKey(raw) {
  const bytes = Buffer.from(raw ?? []);
  if (bytes.length !== KEY_BYTES) fail("INVALID_ED25519_PUBLIC_KEY_LENGTH");
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let encoded = "";
  while (value > 0n) { encoded = ALPHABET[Number(value % 58n)] + encoded; value /= 58n; }
  for (const byte of bytes) { if (byte !== 0) break; encoded = "1" + encoded; }
  return PREFIX + (encoded || "1");
}

export function decodeNearEd25519PublicKey(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) fail("INVALID_NEAR_PUBLIC_KEY_PREFIX");
  const encoded = value.slice(PREFIX.length);
  if (!encoded || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(encoded)) fail("INVALID_NEAR_PUBLIC_KEY_BASE58");
  let number = 0n;
  for (const char of encoded) {
    const digit = INDEX.get(char);
    if (digit === undefined) fail("INVALID_NEAR_PUBLIC_KEY_BASE58");
    number = number * 58n + BigInt(digit);
  }
  const digits = [];
  while (number > 0n) { digits.push(Number(number % 256n)); number /= 256n; }
  digits.reverse();
  let leading = 0;
  while (leading < encoded.length && encoded[leading] === "1") leading += 1;
  const bytes = Buffer.concat([Buffer.alloc(leading), Buffer.from(digits)]);
  if (bytes.length !== KEY_BYTES || encodeNearEd25519PublicKey(bytes) !== value) fail("NON_CANONICAL_NEAR_PUBLIC_KEY");
  return bytes;
}

export function nodeEd25519PublicKeyToNear(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) fail("INVALID_NODE_PUBLIC_KEY");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== KEY_BYTES || bytes.toString("base64url") !== value) fail("INVALID_NODE_PUBLIC_KEY");
  return encodeNearEd25519PublicKey(bytes);
}

export function nearEd25519PublicKeyToNode(value) {
  return decodeNearEd25519PublicKey(value).toString("base64url");
}

export const NEAR_ED25519_KEY_BYTES = KEY_BYTES;
