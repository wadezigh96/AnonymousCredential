import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { ChallengeLedger, createAgentPresentation, issueAgentCredential, makePresentationRequest } from "../src/index.mjs";
import { signCapability, capabilityDigest } from "../src/capability.mjs";
import { AgentAuthorizationRuntime, createAgentRequestProof } from "../src/agent-runtime.mjs";
import { verifyAndAuthorizeAgentRequest } from "../src/paai-verifier.mjs";

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

test("capability delegate must equal issuer-attested credential key", () => {
  const attacker = generateKeyPairSync("ed25519");
  const attackerKey = attacker.publicKey.export({ format: "jwk" }).x;
  const f = fixture({ capabilityDelegateKeyPair: attacker });
  const rejected = verifyAndAuthorizeAgentRequest({ ...f.args, runtime: f.runtime });
  assert.deepEqual(rejected, { authorized: false, code: "DELEGATE_KEY_MISMATCH" });
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
