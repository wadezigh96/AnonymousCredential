import {
  Credential,
  CredentialDefinition,
  CredentialOffer,
  CredentialRequest,
  LinkSecret,
  Nonce,
  Presentation,
  PresentationRequest,
  Schema,
} from "@hyperledger/anoncreds-nodejs";

const ISSUER_ID = "did:example:anonymesh:issuer";
const SCHEMA_ID = "anonymesh:agent-authorization:1";
const CRED_DEF_ID = "anonymesh:agent-authorization:1:CL";
export const PRIVATE_SUBJECT_MARKER = "agent-a-private-subject-7f3a";

export class ChallengeLedger {
  #pending = new Map();

  issue({ audience, task, capabilityDigest, now = Math.floor(Date.now() / 1000), ttlSeconds = 60 }) {
    if (!audience || !task || !capabilityDigest || ttlSeconds < 1) {
      throw new Error("Invalid challenge parameters");
    }
    const nonce = Nonce.generate();
    const challenge = {
      nonce,
      audience,
      task,
      capabilityDigest,
      issuedAt: now,
      expiresAt: now + ttlSeconds,
    };
    this.#pending.set(nonce, { ...challenge, consumed: false });
    return Object.freeze(challenge);
  }

  consume({ nonce, audience, task, capabilityDigest, now = Math.floor(Date.now() / 1000) }) {
    const record = this.#pending.get(nonce);
    if (!record) throw new Error("Unknown or already consumed challenge");
    if (record.expiresAt <= now) throw new Error("Challenge expired");
    if (
      record.audience !== audience ||
      record.task !== task ||
      record.capabilityDigest !== capabilityDigest
    ) {
      throw new Error("Challenge context mismatch");
    }
    if (record.consumed) throw new Error("Challenge replay");
    record.consumed = true;
    return true;
  }
}

export function issueAgentCredential({ validUntil, privateSubject = PRIVATE_SUBJECT_MARKER }) {
  const schema = Schema.create({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    issuerId: ISSUER_ID,
    attributeNames: ["agent_role", "agent_subject", "valid_until", "capability_scope"],
  });

  const {
    credentialDefinition,
    credentialDefinitionPrivate,
    keyCorrectnessProof,
  } = CredentialDefinition.create({
    schemaId: SCHEMA_ID,
    schema,
    signatureType: "CL",
    tag: "v1",
    issuerId: ISSUER_ID,
    supportRevocation: false,
  });

  const credentialOffer = CredentialOffer.create({
    schemaId: SCHEMA_ID,
    credentialDefinitionId: CRED_DEF_ID,
    keyCorrectnessProof,
  });

  // The link secret is created and retained by Agent A; it is never sent to Agent B.
  const linkSecret = LinkSecret.create();
  const { credentialRequest, credentialRequestMetadata } = CredentialRequest.create({
    credentialDefinition,
    linkSecret,
    linkSecretId: "agent-a-local-link-secret",
    credentialOffer,
  });

  const issuedCredential = Credential.create({
    credentialDefinition,
    credentialDefinitionPrivate,
    credentialOffer,
    credentialRequest,
    attributeRawValues: {
      agent_role: "weather_reader",
      agent_subject: privateSubject,
      valid_until: String(validUntil),
      capability_scope: "weather:read",
    },
  });

  const credential = issuedCredential.process({
    credentialRequestMetadata,
    linkSecret,
    credentialDefinition,
  });

  return {
    schema,
    credentialDefinition,
    credential,
    linkSecret,
    schemaId: SCHEMA_ID,
    credentialDefinitionId: CRED_DEF_ID,
  };
}

export function makePresentationRequest(challenge, now = Math.floor(Date.now() / 1000)) {
  return PresentationRequest.fromJson({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    nonce: challenge.nonce,
    requested_attributes: {
      role_ref: { name: "agent_role" },
    },
    requested_predicates: {
      expiry_ref: {
        name: "valid_until",
        p_type: "GE",
        p_value: now,
      },
    },
  });
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

export function verifyAgentPresentation({
  presentation,
  presentationRequest,
  verifierSchema,
  verifierCredentialDefinition,
  challengeLedger,
  challengeContext,
  now = Math.floor(Date.now() / 1000),
}) {
  // Bind the AnonCreds nonce to the verifier's audience, task and capability digest.
  // This ledger is demo-only and in-memory; production needs atomic shared storage.
  challengeLedger.consume({ ...challengeContext, now });
  return presentation.verify({
    presentationRequest,
    schemas: { [SCHEMA_ID]: verifierSchema },
    credentialDefinitions: { [CRED_DEF_ID]: verifierCredentialDefinition },
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
  const presentation = createAgentPresentation(holder, request);
  const valid = verifyAgentPresentation({
    presentation,
    presentationRequest: request,
    verifierSchema: holder.schema,
    verifierCredentialDefinition: holder.credentialDefinition,
    challengeLedger: ledger,
    challengeContext: { nonce: challenge.nonce, ...context },
    now,
  });
  const proofJson = JSON.stringify(presentation.toJson());
  return {
    valid,
    revealedRole: "weather_reader",
    privateSubjectDisclosed: proofJson.includes(PRIVATE_SUBJECT_MARKER),
    proofBytes: Buffer.byteLength(proofJson),
    nonceBoundToContext: true,
  };
}
