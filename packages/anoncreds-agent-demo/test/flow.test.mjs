import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { encodeAnonCredsAttribute, extractCredentialAgentPublicKey } from "../src/agent-key-binding.mjs";
import assert from "node:assert/strict";
import {
  ChallengeLedger,
  PRIVATE_SUBJECT_MARKER,
  createAgentPresentation,
  createTamperedCredentialJson,
  issueAgentCredential,
  issueCredentialForRequest,
  makePresentationRequest,
  verifyAgentPresentation,
} from "../src/index.mjs";
import { Credential, Presentation, PresentationRequest } from "@hyperledger/anoncreds-nodejs";

const fixedNow = 1_800_000_000;
const context = {
  audience: "agent-b.anonymesh.test",
  task: "read:weather",
  capabilityDigest: "sha256:capability-001",
};

function fixture({ validUntil = fixedNow + 600 } = {}) {
  const holder = issueAgentCredential({ validUntil });
  const ledger = new ChallengeLedger();
  const challenge = ledger.issue({ ...context, now: fixedNow, ttlSeconds: 90 });
  const request = makePresentationRequest(challenge, fixedNow);
  ledger.attachPresentationRequest(challenge.nonce, request.toJson());
  return { holder, ledger, challenge, request };
}

test("Agent A proves an authorized role to Agent B without disclosing its private subject", () => {
  const f = fixture();
  const presentation = createAgentPresentation(f.holder, f.request);
  const valid = verifyAgentPresentation({
    presentation,
    presentationRequest: f.request,
    verifierSchema: f.holder.schema,
    verifierCredentialDefinition: f.holder.credentialDefinition,
    challengeLedger: f.ledger,
    challengeContext: { nonce: f.challenge.nonce, ...context },
    now: fixedNow,
  });

  assert.equal(valid, true);
  const proofJson = JSON.stringify(presentation.toJson());
  assert.equal(proofJson.includes(PRIVATE_SUBJECT_MARKER), false);
  assert.match(proofJson, /weather_reader/);
});


test("invalid proof for a different nonce does not consume the original challenge", () => {
  const f = fixture();
  const otherChallenge = f.ledger.issue({ ...context, now: fixedNow, ttlSeconds: 90 });
  const otherRequest = makePresentationRequest(otherChallenge, fixedNow);
  f.ledger.attachPresentationRequest(otherChallenge.nonce, otherRequest.toJson());
  const invalidPresentation = createAgentPresentation(f.holder, otherRequest);

  assert.equal(verifyAgentPresentation({
    presentation: invalidPresentation,
    presentationRequest: f.request,
    verifierSchema: f.holder.schema,
    verifierCredentialDefinition: f.holder.credentialDefinition,
    challengeLedger: f.ledger,
    challengeContext: { nonce: f.challenge.nonce, ...context },
    now: fixedNow,
  }), false);

  const validPresentation = createAgentPresentation(f.holder, f.request);
  assert.equal(verifyAgentPresentation({
    presentation: validPresentation,
    presentationRequest: f.request,
    verifierSchema: f.holder.schema,
    verifierCredentialDefinition: f.holder.credentialDefinition,
    challengeLedger: f.ledger,
    challengeContext: { nonce: f.challenge.nonce, ...context },
    now: fixedNow,
  }), true);
});

test("challenge nonce cannot be replayed", () => {
  const f = fixture();
  const presentation = createAgentPresentation(f.holder, f.request);
  assert.equal(verifyAgentPresentation({
    presentation,
    presentationRequest: f.request,
    verifierSchema: f.holder.schema,
    verifierCredentialDefinition: f.holder.credentialDefinition,
    challengeLedger: f.ledger,
    challengeContext: { nonce: f.challenge.nonce, ...context },
    now: fixedNow,
  }), true);
  assert.throws(() => f.ledger.consume({
    nonce: f.challenge.nonce,
    ...context,
    now: fixedNow,
  }), /Unknown or already consumed challenge|Challenge replay/);
});


test("thrown native verification errors do not consume a challenge", () => {
  const ledger = new ChallengeLedger();
  const challenge = ledger.issue({ ...context, now: fixedNow, ttlSeconds: 90 });
  const request = makePresentationRequest(challenge, fixedNow);
  ledger.attachPresentationRequest(challenge.nonce, request.toJson());

  assert.equal(ledger.verifyAndConsume({
    nonce: challenge.nonce,
    ...context,
    now: fixedNow,
    verify: () => { throw new Error("malformed proof"); },
  }), false);

  assert.equal(ledger.verifyAndConsume({
    nonce: challenge.nonce,
    ...context,
    now: fixedNow,
    verify: storedRequest => storedRequest.nonce === challenge.nonce,
  }), true);
});

test("audience, task and capability context mismatches are rejected", () => {
  const f = fixture();
  assert.throws(() => f.ledger.consume({
    nonce: f.challenge.nonce,
    ...context,
    audience: "attacker.example",
    now: fixedNow,
  }), /Challenge context mismatch/);
  assert.throws(() => f.ledger.consume({
    nonce: f.challenge.nonce,
    ...context,
    task: "transfer:funds",
    now: fixedNow,
  }), /Challenge context mismatch/);
  assert.throws(() => f.ledger.consume({
    nonce: f.challenge.nonce,
    ...context,
    capabilityDigest: "sha256:other-capability",
    now: fixedNow,
  }), /Challenge context mismatch/);
});

test("expired verifier challenge is rejected", () => {
  const ledger = new ChallengeLedger();
  const challenge = ledger.issue({ ...context, now: fixedNow, ttlSeconds: 5 });
  assert.throws(() => ledger.consume({
    nonce: challenge.nonce,
    ...context,
    now: fixedNow + 5,
  }), /Challenge expired/);
});

test("expired credential cannot satisfy the hidden valid_until predicate", () => {
  const f = fixture({ validUntil: fixedNow - 1 });
  let rejected = false;
  try {
    const presentation = createAgentPresentation(f.holder, f.request);
    rejected = !presentation.verify({
      presentationRequest: f.request,
      schemas: { [f.holder.schemaId]: f.holder.schema },
      credentialDefinitions: { [f.holder.credentialDefinitionId]: f.holder.credentialDefinition },
    });
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);
});

test("tampered credential attributes do not produce a valid proof", () => {
  const f = fixture();
  const tamperedJson = createTamperedCredentialJson(f.holder.credential);
  const tamperedCredential = Credential.fromJson(tamperedJson);
  const presentation = Presentation.create({
    presentationRequest: f.request,
    credentials: [{ credential: tamperedCredential }],
    credentialsProve: [
      { entryIndex: 0, referent: "role_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "agent_key_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "expiry_ref", isPredicate: true, reveal: false },
    ],
    selfAttest: {},
    linkSecret: f.holder.linkSecret,
    schemas: { [f.holder.schemaId]: f.holder.schema },
    credentialDefinitions: { [f.holder.credentialDefinitionId]: f.holder.credentialDefinition },
  });
  assert.equal(presentation.verify({
    presentationRequest: f.request,
    schemas: { [f.holder.schemaId]: f.holder.schema },
    credentialDefinitions: { [f.holder.credentialDefinitionId]: f.holder.credentialDefinition },
  }), false);
});

test("proof for another nonce does not verify against the verifier request", () => {
  const f = fixture();
  const presentation = createAgentPresentation(f.holder, f.request);
  const differentNonceRequest = PresentationRequest.fromJson({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    nonce: "123456789012345678901",
    requested_attributes: {
      role_ref: { name: "agent_role" },
      agent_key_ref: { name: "agent_public_key" },
    },
    requested_predicates: {
      expiry_ref: { name: "valid_until", p_type: ">=", p_value: fixedNow },
    },
  });
  assert.equal(presentation.verify({
    presentationRequest: differentNonceRequest,
    schemas: { [f.holder.schemaId]: f.holder.schema },
    credentialDefinitions: { [f.holder.credentialDefinitionId]: f.holder.credentialDefinition },
  }), false);
});


test("credential presentation reveals issuer-bound Ed25519 key with valid AnonCreds encoding", () => {
  const f = fixture();
  const presentation = createAgentPresentation(f.holder, f.request).toJson();
  const revealed = presentation.requested_proof.revealed_attrs.agent_key_ref;
  assert.equal(revealed.raw, f.holder.agentPublicKey);
  assert.equal(revealed.encoded, encodeAnonCredsAttribute(f.holder.agentPublicKey));
  assert.equal(extractCredentialAgentPublicKey(presentation), f.holder.agentPublicKey);
});

test("rejects raw agent key substitution when encoded proof value remains unchanged", () => {
  const f = fixture();
  const presentation = createAgentPresentation(f.holder, f.request).toJson();
  presentation.requested_proof.revealed_attrs.agent_key_ref.raw =
    generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x;
  assert.throws(
    () => extractCredentialAgentPublicKey(presentation),
    error => error.code === "AGENT_KEY_ENCODING_MISMATCH",
  );
});

test("rejects malformed agent public keys at issuer boundary", () => {
  assert.throws(
    () => issueCredentialForRequest({ issuerConfig: {}, credentialRequest: {}, validUntil: fixedNow + 600, agentPublicKey: "not-a-key" }),
    error => error.code === "INVALID_AGENT_PUBLIC_KEY",
  );
});
