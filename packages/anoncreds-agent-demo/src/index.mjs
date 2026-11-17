import { randomBytes, generateKeyPairSync } from "node:crypto";
import { validateAgentPublicKey, extractCredentialAgentPublicKey } from "./agent-key-binding.mjs";
import {
  Credential,
  CredentialDefinition,
  CredentialDefinitionPrivate,
  CredentialOffer,
  CredentialRequest,
  CredentialRequestMetadata,
  LinkSecret,
  Nonce,
  Presentation,
  PresentationRequest,
  Schema,
} from "@hyperledger/anoncreds-nodejs";
import { nodeEd25519PublicKeyToNear } from "./near-key-format.mjs";

const ISSUER_ID = "did:example:anonymesh:issuer";
export const SCHEMA_ID = "anonymesh:agent-authorization:1";
export const CRED_DEF_ID = "anonymesh:agent-authorization:1:CL";
export const PRIVATE_SUBJECT_MARKER = "agent-a-private-subject-7f3a";

export class ChallengeLedger {
  #pending = new Map();

  issue({ audience, task, capabilityDigest, now = Math.floor(Date.now() / 1000), ttlSeconds = 60 }) {
    if (!audience || !task || !capabilityDigest || !Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error("Invalid challenge parameters");
    }
    const nonce = Nonce.generate();
    const challenge = {
      nonce, audience, task, capabilityDigest,
      issuedAt: now, expiresAt: now + ttlSeconds,
      consumed: false, presentationRequest: null,
    };
    this.#pending.set(nonce, challenge);
    return Object.freeze({
      nonce, audience, task, capabilityDigest,
      issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt,
    });
  }

  attachPresentationRequest(nonce, presentationRequest) {
    const record = this.#pending.get(nonce);
    if (!record || record.consumed || record.presentationRequest) {
      throw new Error("Challenge missing, consumed, or already initialized");
    }
    if (presentationRequest?.nonce !== nonce) {
      throw new Error("Presentation request nonce mismatch");
    }
    record.presentationRequest = structuredClone(presentationRequest);
  }

  get(nonce) {
    const record = this.#pending.get(nonce);
    if (!record) return null;
    return {
      nonce: record.nonce, audience: record.audience, task: record.task,
      capabilityDigest: record.capabilityDigest, issuedAt: record.issuedAt,
      expiresAt: record.expiresAt, consumed: record.consumed,
      presentationRequest: record.presentationRequest && structuredClone(record.presentationRequest),
    };
  }

  #assertPending({ nonce, audience, task, capabilityDigest, now }) {
    const record = this.#pending.get(nonce);
    if (!record || record.consumed) throw new Error("Unknown or already consumed challenge");
    if (record.expiresAt <= now) throw new Error("Challenge expired");
    if (
      record.audience !== audience ||
      record.task !== task ||
      record.capabilityDigest !== capabilityDigest
    ) throw new Error("Challenge context mismatch");
    if (!record.presentationRequest) throw new Error("Challenge request is not initialized");
    return record;
  }

  consume(context) {
    const record = this.#assertPending({
      ...context,
      now: context.now ?? Math.floor(Date.now() / 1000),
    });
    record.consumed = true;
    return true;
  }

  // This method is deliberately synchronous: on a single Node.js event loop,
  // proof verification and nonce consumption form one non-interleaved critical section.
  // Invalid proofs and thrown verification errors leave the challenge pending.
  verifyAndConsume({ ...context }) {
    const { verify } = context;
    if (typeof verify !== "function") throw new Error("A proof verification callback is required");
    const now = context.now ?? Math.floor(Date.now() / 1000);
    const pending = this.#assertPending({ ...context, now });
    let valid = false;
    try {
      valid = verify(structuredClone(pending.presentationRequest)) === true;
    } catch {
      // Malformed or cryptographically invalid presentations fail closed.
      // No challenge state is changed on this path.
      return false;
    }
    if (!valid) return false;
    const record = this.#assertPending({ ...context, now });
    record.consumed = true;
    return true;
  }
}

export function createIssuerSetup({ issuerRegistryPublicKey } = {}) {
  const registryKey = issuerRegistryPublicKey ?? nodeEd25519PublicKeyToNear(generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x);
  const schema = Schema.create({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    issuerId: ISSUER_ID,
    attributeNames: ["agent_role", "agent_subject", "valid_until", "capability_scope", "agent_public_key", "issuer_registry_key"],
  });
  const { credentialDefinition, credentialDefinitionPrivate, keyCorrectnessProof } =
    CredentialDefinition.create({
      schemaId: SCHEMA_ID, schema, signatureType: "CL", tag: "v1",
      issuerId: ISSUER_ID, supportRevocation: false,
    });
  const offer = CredentialOffer.create({
    schemaId: SCHEMA_ID,
    credentialDefinitionId: CRED_DEF_ID,
    keyCorrectnessProof,
  });
  return {
    schema: schema.toJson(),
    credentialDefinition: credentialDefinition.toJson(),
    credentialDefinitionPrivate: credentialDefinitionPrivate.toJson(),
    offer: offer.toJson(),
    issuerRegistryPublicKey: registryKey,
  };
}

export function createHolderCredentialRequest({ publicConfig, offer }) {
  const linkSecret = LinkSecret.create();
  const request = CredentialRequest.create({
    entropy: randomBytes(32).toString("hex"),
    credentialDefinition: CredentialDefinition.fromJson(publicConfig.credentialDefinition),
    linkSecret,
    linkSecretId: "anonymesh-agent-a-local-link-secret",
    credentialOffer: CredentialOffer.fromJson(offer),
  });
  return {
    linkSecret,
    credentialRequest: request.credentialRequest.toJson(),
    credentialRequestMetadata: request.credentialRequestMetadata.toJson(),
  };
}

export function issueCredentialForRequest({ issuerConfig, credentialRequest, validUntil, agentPublicKey }) {
  validateAgentPublicKey(agentPublicKey);
  if (credentialRequest.cred_def_id !== CRED_DEF_ID) {
    throw new Error("Credential request targets an unexpected credential definition");
  }
  const credential = Credential.create({
    credentialDefinition: CredentialDefinition.fromJson(issuerConfig.credentialDefinition),
    credentialDefinitionPrivate: CredentialDefinitionPrivate.fromJson(issuerConfig.credentialDefinitionPrivate),
    credentialOffer: CredentialOffer.fromJson(issuerConfig.offer),
    credentialRequest: CredentialRequest.fromJson(credentialRequest),
    attributeRawValues: {
      agent_role: "weather_reader",
      agent_subject: PRIVATE_SUBJECT_MARKER,
      valid_until: String(validUntil),
      capability_scope: "weather:read",
      agent_public_key: agentPublicKey,
      issuer_registry_key: issuerConfig.issuerRegistryPublicKey,
    },
  });
  return credential.toJson();
}

export function processHolderCredential({ credentialJson, credentialRequestMetadata, linkSecret, publicConfig }) {
  const credential = Credential.fromJson(credentialJson);
  credential.process({
    credentialRequestMetadata: CredentialRequestMetadata.fromJson(credentialRequestMetadata),
    linkSecret,
    credentialDefinition: CredentialDefinition.fromJson(publicConfig.credentialDefinition),
  });
  return credential.toJson();
}

export function makePresentationRequest(challenge, now = Math.floor(Date.now() / 1000)) {
  return PresentationRequest.fromJson({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    nonce: challenge.nonce,
    requested_attributes: {
      role_ref: { name: "agent_role" },
      agent_key_ref: { name: "agent_public_key" },
      issuer_key_ref: { name: "issuer_registry_key" },
    },
    requested_predicates: {
      expiry_ref: { name: "valid_until", p_type: ">=", p_value: now },
    },
  });
}

export function createPresentationFromWallet({ credentialJson, linkSecret, publicConfig, presentationRequestJson }) {
  const presentationRequest = PresentationRequest.fromJson(presentationRequestJson);
  const presentation = Presentation.create({
    presentationRequest,
    credentials: [{ credential: Credential.fromJson(credentialJson) }],
    credentialsProve: [
      { entryIndex: 0, referent: "role_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "agent_key_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "issuer_key_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "expiry_ref", isPredicate: true, reveal: false },
    ],
    selfAttest: {},
    linkSecret,
    schemas: { [SCHEMA_ID]: publicConfig.schema },
    credentialDefinitions: { [CRED_DEF_ID]: publicConfig.credentialDefinition },
  });
  return presentation.toJson();
}

export function verifyAgentPresentation({
  presentation,
  presentationJson,
  presentationRequest,
  presentationRequestJson,
  verifierSchema,
  verifierCredentialDefinition,
  challengeLedger,
  challengeContext,
  now = Math.floor(Date.now() / 1000),
}) {
  const serializedPresentation = presentationJson ?? presentation?.toJson?.() ?? presentation;
  if (!serializedPresentation) {
    throw new Error("Presentation is required");
  }
  return challengeLedger.verifyAndConsume({
    ...challengeContext,
    now,
    verify: (trustedRequestJson) => {
      // The request comes from the verifier's ledger, never from the presenter.
      const valid = Presentation.fromJson(serializedPresentation).verify({
        presentationRequest: PresentationRequest.fromJson(trustedRequestJson),
        schemas: { [SCHEMA_ID]: verifierSchema },
        credentialDefinitions: { [CRED_DEF_ID]: verifierCredentialDefinition },
      });
      if (!valid) return false;
      // AnonCreds proves encoded values; verifier must check raw-to-encoded too.
      extractCredentialAgentPublicKey(serializedPresentation);
      return true;
    },
  });
}

// Compatibility helper for the earlier in-process demo and its benchmark.
export function issueAgentCredential({ validUntil, privateSubject = PRIVATE_SUBJECT_MARKER }) {
  const agentKeyPair = generateKeyPairSync("ed25519");
  const agentPublicKey = agentKeyPair.publicKey.export({ format: "jwk" }).x;
  const issuerConfig = createIssuerSetup();
  const linkSecret = LinkSecret.create();
  const offer = CredentialOffer.fromJson(issuerConfig.offer);
  const request = CredentialRequest.create({
    entropy: randomBytes(32).toString("hex"),
    credentialDefinition: CredentialDefinition.fromJson(issuerConfig.credentialDefinition),
    linkSecret,
    linkSecretId: "agent-a-local-link-secret",
    credentialOffer: offer,
  });
  const credentialJson = issueCredentialForRequest({
    issuerConfig,
    credentialRequest: request.credentialRequest.toJson(),
    validUntil,
    agentPublicKey,
  });
  const credential = Credential.fromJson(credentialJson);
  credential.process({
    credentialRequestMetadata: request.credentialRequestMetadata,
    linkSecret,
    credentialDefinition: CredentialDefinition.fromJson(issuerConfig.credentialDefinition),
  });
  return {
    schema: Schema.fromJson(issuerConfig.schema),
    credentialDefinition: CredentialDefinition.fromJson(issuerConfig.credentialDefinition),
    credential,
    linkSecret,
    schemaId: SCHEMA_ID,
    credentialDefinitionId: CRED_DEF_ID,
    agentPublicKey,
    agentPrivateKey: agentKeyPair.privateKey,
    issuerRegistryPublicKey: issuerConfig.issuerRegistryPublicKey,
  };
}

export function createAgentPresentation(holder, presentationRequest) {
  return Presentation.create({
    presentationRequest,
    credentials: [{ credential: holder.credential }],
    credentialsProve: [
      { entryIndex: 0, referent: "role_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "agent_key_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "issuer_key_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "expiry_ref", isPredicate: true, reveal: false },
    ],
    selfAttest: {},
    linkSecret: holder.linkSecret,
    schemas: { [holder.schemaId]: holder.schema },
    credentialDefinitions: { [holder.credentialDefinitionId]: holder.credentialDefinition },
  });
}

export function createTamperedCredentialJson(credential) {
  const json = structuredClone(credential.toJson());
  if (!json.values?.agent_role) throw new Error("Unexpected AnonCreds credential JSON shape");
  json.values.agent_role.raw = "administrator";
  json.values.agent_role.encoded = "999999";
  return json;
}

export function runDemo() {
  const now = Math.floor(Date.now() / 1000);
  const holder = issueAgentCredential({ validUntil: now + 3600 });
  const ledger = new ChallengeLedger();
  const context = {
    audience: "agent-b.anonymesh.test",
    task: "read:weather",
    capabilityDigest: "sha256:demo-capability-digest",
  };
  const challenge = ledger.issue({ ...context, now, ttlSeconds: 60 });
  const request = makePresentationRequest(challenge, now);
  ledger.attachPresentationRequest(challenge.nonce, request.toJson());
  const presentation = createAgentPresentation(holder, request);
  const presentationJson = presentation.toJson();
  const valid = verifyAgentPresentation({
    presentationJson,
    presentationRequestJson: request.toJson(),
    verifierSchema: holder.schema.toJson(),
    verifierCredentialDefinition: holder.credentialDefinition.toJson(),
    challengeLedger: ledger,
    challengeContext: { nonce: challenge.nonce, ...context },
    now,
  });
  const proofJson = JSON.stringify(presentationJson);
  return {
    valid,
    revealedRole: "weather_reader",
    privateSubjectDisclosed: proofJson.includes(PRIVATE_SUBJECT_MARKER),
    proofBytes: Buffer.byteLength(proofJson),
    nonceBoundToContext: true,
  };
}
