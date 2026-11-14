import { randomBytes } from "node:crypto";
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
    this.#assertPending({ ...context, now });
    const valid = verify();
    if (valid !== true) return false;
    const record = this.#assertPending({ ...context, now });
    record.consumed = true;
    return true;
  }
}

export function createIssuerSetup() {
  const schema = Schema.create({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    issuerId: ISSUER_ID,
    attributeNames: ["agent_role", "agent_subject", "valid_until", "capability_scope"],
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

export function issueCredentialForRequest({ issuerConfig, credentialRequest, validUntil }) {
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
    requested_attributes: { role_ref: { name: "agent_role" } },
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
  const serializedRequest = presentationRequestJson ?? presentationRequest?.toJson?.() ?? presentationRequest;
  if (!serializedPresentation || !serializedRequest) {
    throw new Error("Presentation and verifier-stored presentation request are required");
  }
  return challengeLedger.verifyAndConsume({
    ...challengeContext,
    now,
    verify: () => Presentation.fromJson(serializedPresentation).verify({
      presentationRequest: PresentationRequest.fromJson(serializedRequest),
      schemas: { [SCHEMA_ID]: verifierSchema },
      credentialDefinitions: { [CRED_DEF_ID]: verifierCredentialDefinition },
    }),
  });
}

// Compatibility helper for the earlier in-process demo and its benchmark.
export function issueAgentCredential({ validUntil, privateSubject = PRIVATE_SUBJECT_MARKER }) {
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
  };
}

export function createAgentPresentation(holder, presentationRequest) {
  return Presentation.create({
    presentationRequest,
    credentials: [{ credential: holder.credential }],
    credentialsProve: [
      { entryIndex: 0, referent: "role_ref", isPredicate: false, reveal: true },
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
