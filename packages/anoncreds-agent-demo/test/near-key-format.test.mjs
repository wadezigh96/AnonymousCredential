import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { decodeNearEd25519PublicKey, encodeNearEd25519PublicKey, nearEd25519PublicKeyToNode, nodeEd25519PublicKeyToNear } from "../src/near-key-format.mjs";
import {
  encodeAnonCredsAttribute,
  extractCredentialIssuerRegistryKey,
  assertCredentialIssuerRegistryKeyMatches,
} from "../src/agent-key-binding.mjs";


test("round-trips Node Ed25519 JWK x through canonical NEAR format", () => {
  const key = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  const near = nodeEd25519PublicKeyToNear(key);
  assert.match(near, /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/);
  assert.equal(nearEd25519PublicKeyToNode(near), key);
  assert.equal(encodeNearEd25519PublicKey(decodeNearEd25519PublicKey(near)), near);
});

test("accepts the contract's deterministic Ed25519 vector", () => {
  const near = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";
  assert.equal(decodeNearEd25519PublicKey(near).length, 32);
  assert.equal(encodeNearEd25519PublicKey(decodeNearEd25519PublicKey(near)), near);
});

test("rejects invalid, non-canonical, and wrong-length keys", () => {
  for (const value of ["", "6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp", "ed25519x:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp", "ed25519:0OIl", "ed25519:2"]) {
    assert.throws(() => decodeNearEd25519PublicKey(value));
  }
  assert.throws(() => encodeNearEd25519PublicKey(Buffer.alloc(31)));
  assert.throws(() => nodeEd25519PublicKeyToNear("not-a-key"));
});

test("credential issuer key accepts legacy Node and canonical NEAR formats", () => {
  const nodeKey = generateKeyPairSync("ed25519")
    .publicKey.export({ format: "jwk" }).x;
  const nearKey = nodeEd25519PublicKeyToNear(nodeKey);

  for (const raw of [nodeKey, nearKey]) {
    const presentation = {
      requested_proof: {
        revealed_attrs: {
          issuer_key_ref: {
            raw,
            encoded: encodeAnonCredsAttribute(raw),
          },
        },
      },
    };

    assert.equal(
      extractCredentialIssuerRegistryKey(presentation),
      nodeKey,
    );
  }
});

test("credential issuer key rejects malformed and incorrectly encoded values", () => {
  for (const raw of ["invalid-key", "ed25519:invalid"]) {
    const presentation = {
      requested_proof: {
        revealed_attrs: {
          issuer_key_ref: {
            raw,
            encoded: encodeAnonCredsAttribute(raw),
          },
        },
      },
    };

    assert.throws(() => extractCredentialIssuerRegistryKey(presentation));
  }

  const raw = generateKeyPairSync("ed25519")
    .publicKey.export({ format: "jwk" }).x;

  assert.throws(() => extractCredentialIssuerRegistryKey({
    requested_proof: {
      revealed_attrs: {
        issuer_key_ref: {
          raw,
          encoded: "incorrect-encoding",
        },
      },
    },
  }));
});

test("registry matching accepts equivalent credential key and rejects a different issuer", () => {
  const nodeKey = generateKeyPairSync("ed25519")
    .publicKey.export({ format: "jwk" }).x;
  const otherNodeKey = generateKeyPairSync("ed25519")
    .publicKey.export({ format: "jwk" }).x;

  for (const raw of [nodeKey, nodeEd25519PublicKeyToNear(nodeKey)]) {
    const presentation = {
      requested_proof: {
        revealed_attrs: {
          issuer_key_ref: {
            raw,
            encoded: encodeAnonCredsAttribute(raw),
          },
        },
      },
    };

    assert.equal(
      assertCredentialIssuerRegistryKeyMatches(presentation, nodeKey),
      true,
    );

    assert.throws(
      () => assertCredentialIssuerRegistryKeyMatches(presentation, otherNodeKey),
      error => error.code === "ISSUER_REGISTRY_KEY_MISMATCH",
    );
  }
});
