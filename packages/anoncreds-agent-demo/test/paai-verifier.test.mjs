import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { nearEd25519PublicKeyToNode, nodeEd25519PublicKeyToNear } from "../src/near-key-format.mjs";
import { AnoncredsError } from "@hyperledger/anoncreds-nodejs";
import { ChallengeLedger, createAgentPresentation, issueAgentCredential, makePresentationRequest } from "../src/index.mjs";
import { signCapability, capabilityDigest } from "../src/capability.mjs";
import { AgentAuthorizationRuntime, createAgentRequestProof } from "../src/agent-runtime.mjs";
import { classifyVerificationError, verifyAndAuthorizeAgentRequest } from "../src/paai-verifier.mjs";

const now = 1_800_000_000;
const audience = "agent-b.anonymesh.test";
const action = "read:weather";
const resource = "weather:global";

function fixture({ quota = 2, capabilityDelegateKeyPair, capabilitySignerPrivateKey } = {}) {
  const root = generateKeyPairSync("ed25519");
  const holder = issueAgentCredential({ validUntil: now + 600 });
  const delegateKey = capabilityDelegateKeyPair?.publicKey.export({ format: "jwk" }).x ?? holder.agentPublicKey;
  const signer = capabilitySignerPrivateKey ?? root.privateKey;
  const capability = signCapability({
    parentDigest: null,
    issuerKey: root.publicKey.export({ format: "jwk" }).x,
    delegateKey,
    audience,
    action,
    resource,
    expiresAt: now + 300,
    quota,
  }, signer);
  const chain = [capability];
  const context = { audience, task: action, capabilityDigest: capabilityDigest(capability) };
  const ledger = new ChallengeLedger();
  const challenge = ledger.issue({ ...context, now, ttlSeconds: 90 });
  const request = makePresentationRequest(challenge, now);
  ledger.attachPresentationRequest(challenge.nonce, request.toJson());
  const presentation = createAgentPresentation(holder, request).toJson();
  const signerPrivateKey = capabilityDelegateKeyPair?.privateKey ?? holder.agentPrivateKey;
  const proof = createAgentRequestProof({ challenge, capabilityChain: chain, privateKey: signerPrivateKey });
  return {
    root,
    holder,
    chain,
    challenge,
    ledger,
    presentation,
    proof,
    runtime: new AgentAuthorizationRuntime(),
    args: {
      nonce: challenge.nonce,
      presentationJson: presentation,
      capabilityChain: chain,
      requestProof: proof,
      trustedRootIssuer: root.publicKey.export({ format: "jwk" }).x,
      expected: { audience, action, resource },
      challengeLedger: ledger,
      verifierSchema: holder.schema,
      verifierCredentialDefinition: holder.credentialDefinition,
      now,
    },
  };
}

test("unified verifier requires valid AnonCreds, credential-bound Ed25519 PoP and trusted capability", () => {
  const f = fixture();
  const result = verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime });
  assert.equal(result.authorized, true);
  assert.equal(result.action, action);
  assert.equal(result.resource, resource);
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, true);
});

test("bad AnonCreds proof is rejected without consuming challenge or quota", () => {
  const f = fixture();
  const invalid = structuredClone(f.presentation);
  invalid.requested_proof.revealed_attrs.agent_key_ref.encoded = "123";
  const rejected = verifyAndAuthorizeAgentRequest({
    ...f.args, presentationJson: invalid, runtime: f.runtime,
  });
  assert.deepEqual(rejected, { authorized: false, code: "ANONCREDS_PROOF_INVALID" });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
  const accepted = verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime });
  assert.equal(accepted.authorized, true);
});

test("verifier configuration errors are not reported as proof failures", () => {
  const f = fixture();
  const missingSchema = verifyAndAuthorizeAgentRequest({
    ...f.args, verifierSchema: null, runtime: f.runtime,
  });
  assert.deepEqual(missingSchema, {
    authorized: false, code: "INVALID_VERIFIER_CONFIGURATION",
  });
  const missingCredentialDefinition = verifyAndAuthorizeAgentRequest({
    ...f.args, verifierCredentialDefinition: null, runtime: f.runtime,
  });
  assert.deepEqual(missingCredentialDefinition, {
    authorized: false, code: "INVALID_VERIFIER_CONFIGURATION",
  });
  assert.equal(JSON.stringify(missingSchema).includes("agent-a-private-subject-7f3a"), false);
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
});

test("unexpected authorization errors are not reported as invalid proofs", () => {
  const f = fixture();
  const rejected = verifyAndAuthorizeAgentRequest({
    ...f.args,
    runtime: { authorizeAndConsume() { throw new Error("internal test failure"); } },
  });
  assert.deepEqual(rejected, { authorized: false, code: "CAPABILITY_AUTHORIZATION_FAILED" });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
});

test("native initialization and internal errors remain diagnosable", () => {
  const nativeInitializationError = new AnoncredsError({
    code: 100,
    message: "Native anoncreds has not been registered yet",
  });
  assert.equal(classifyVerificationError(nativeInitializationError), "ANONCREDS_NATIVE_ERROR");
  assert.equal(classifyVerificationError(new Error("unexpected internal failure")), "ANONCREDS_INTERNAL_ERROR");
});

test("capability delegate must equal issuer-attested credential key", () => {
  const attacker = generateKeyPairSync("ed25519");
  const attackerKey = attacker.publicKey.export({ format: "jwk" }).x;
  const f = fixture({ capabilityDelegateKeyPair: attacker });
  const rejected = verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime });
  assert.deepEqual(rejected, { authorized: false, code: "CREDENTIAL_CAPABILITY_KEY_MISMATCH" });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
});

test("invalid Ed25519 proof-of-possession is rejected without consuming challenge", () => {
  const f = fixture();
  const badProof = { ...f.proof, signature: Buffer.alloc(64).toString("base64url") };
  const rejected = verifyAndAuthorizeAgentRequest({
    ...f.args, requestProof: badProof, runtime: f.runtime,
  });
  assert.deepEqual(rejected, { authorized: false, code: "INVALID_REQUEST_SIGNATURE" });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
  assert.equal(verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime }).authorized, true);
});

test("unified verifier rejects replay", () => {
  const f = fixture();
  assert.equal(verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime }).authorized, true);
  assert.deepEqual(
    verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime }),
    { authorized: false, code: "CHALLENGE_EXPIRED_OR_CONSUMED" },
  );
});

test("unified verifier rejects a capability signed by an untrusted root", () => {
  const f = fixture();
  const otherRoot = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  const rejected = verifyAndAuthorizeAgentRequest({
    ...f.args, trustedRootIssuer: otherRoot, runtime: f.runtime,
  });
  assert.deepEqual(rejected, { authorized: false, code: "INVALID_ROOT" });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
});

test("registry-backed verifier requires the credential-bound issuer key and metadata", () => {
  const f = fixture();
  const schemaHash = createHash("sha256").update(JSON.stringify(f.holder.schema.toJson())).digest("hex");
  const issuerRecord = {
    active: true,
    publicKey: f.holder.issuerRegistryPublicKey,
    nodePublicKey: nearEd25519PublicKeyToNode(f.holder.issuerRegistryPublicKey),
    keyVersion: 1,
    schemaHash,
    statusEpoch: 0,
  };
  const accepted = verifyAndAuthorizeAgentRequest({
    ...f.args,
    issuerRecord,
    registryRequired: true,
    expected: { ...f.args.expected, issuerKeyVersion: 1, schemaHash },
    runtime: f.runtime,
  });
  assert.equal(accepted.authorized, true);

  const second = fixture();
  const secondSchemaHash = createHash("sha256").update(JSON.stringify(second.holder.schema.toJson())).digest("hex");
  const otherNodeKey = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  const rejected = verifyAndAuthorizeAgentRequest({
    ...second.args,
    issuerRecord: {
      ...issuerRecord,
      publicKey: nodeEd25519PublicKeyToNear(otherNodeKey),
      nodePublicKey: otherNodeKey,
    },
    registryRequired: true,
    expected: { ...second.args.expected, issuerKeyVersion: 1, schemaHash: secondSchemaHash },
    runtime: second.runtime,
  });
  assert.deepEqual(rejected, { authorized: false, code: "ISSUER_REGISTRY_KEY_MISMATCH" });
  assert.equal(second.ledger.get(second.challenge.nonce).consumed, false);
});

test("registry verifier rejects inconsistent public and Node issuer keys before consuming challenge", () => {
  const f = fixture();
  const schemaHash = createHash("sha256").update(JSON.stringify(f.holder.schema.toJson())).digest("hex");
  const validNearKey = f.holder.issuerRegistryPublicKey;
  const validNodeKey = nearEd25519PublicKeyToNode(validNearKey);
  const otherNodeKey = generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;

  const rejected = verifyAndAuthorizeAgentRequest({
    ...f.args,
    issuerRecord: {
      active: true,
      publicKey: validNearKey,
      nodePublicKey: otherNodeKey,
      keyVersion: 1,
      schemaHash,
      statusEpoch: 0,
    },
    registryRequired: true,
    expected: { ...f.args.expected, issuerKeyVersion: 1, schemaHash },
    runtime: f.runtime,
  });

  assert.deepEqual(rejected, {
    authorized: false,
    code: "ISSUER_REGISTRY_RECORD_INVALID",
  });
  assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
});

test("required registry mode fails closed before consuming challenge state", () => {
  for (const issuerRecord of [null, { active: false, nodePublicKey: "ignored", keyVersion: 1, schemaHash: "a".repeat(64) }]) {
    const f = fixture();
    const rejected = verifyAndAuthorizeAgentRequest({
      ...f.args,
      issuerRecord,
      registryRequired: true,
      runtime: f.runtime,
    });
    assert.deepEqual(rejected, { authorized: false, code: "REGISTRY_UNAVAILABLE" });
    assert.equal(f.ledger.get(f.challenge.nonce).consumed, false);
  }
});
