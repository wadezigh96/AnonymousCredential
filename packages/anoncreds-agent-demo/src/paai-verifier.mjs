import { AnoncredsError, Presentation, PresentationRequest } from "@hyperledger/anoncreds-nodejs";
import { extractCredentialAgentPublicKey } from "./agent-key-binding.mjs";
import { AgentAuthorizationRuntime } from "./agent-runtime.mjs";
import { CRED_DEF_ID, SCHEMA_ID } from "./index.mjs";

const REQUIRED_SCHEMA_ATTRIBUTES = [
  "agent_role",
  "agent_subject",
  "valid_until",
  "capability_scope",
  "agent_public_key",
];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function serializedConfig(value) {
  if (!isRecord(value)) return null;
  if (typeof value.toJson !== "function") return value;
  try {
    return value.toJson();
  } catch {
    return null;
  }
}

function verifierConfigurationError(verifierSchema, verifierCredentialDefinition) {
  verifierSchema = serializedConfig(verifierSchema);
  verifierCredentialDefinition = serializedConfig(verifierCredentialDefinition);
  if (!isRecord(verifierSchema) || !isRecord(verifierCredentialDefinition)) return true;
  if (
    verifierSchema.name !== "anonymesh-agent-authorization" ||
    verifierSchema.version !== "1.0" ||
    verifierSchema.issuerId !== "did:example:anonymesh:issuer" ||
    !Array.isArray(verifierSchema.attrNames) ||
    verifierSchema.attrNames.length !== REQUIRED_SCHEMA_ATTRIBUTES.length ||
    verifierSchema.attrNames.some((name, index) => name !== REQUIRED_SCHEMA_ATTRIBUTES[index])
  ) return true;
  return (
    verifierCredentialDefinition.schemaId !== SCHEMA_ID ||
    verifierCredentialDefinition.type !== "CL" ||
    verifierCredentialDefinition.tag !== "v1" ||
    !isRecord(verifierCredentialDefinition.value) ||
    !isRecord(verifierCredentialDefinition.value.primary)
  );
}

export function classifyVerificationError(error) {
  // anoncreds-nodejs exposes native verification rejection as AnoncredsError
  // code 7 with the stable "Proof rejected:" message prefix. Other native
  // errors, including the package's code-100 initialization error, remain
  // diagnosable as native failures.
  if (
    error instanceof AnoncredsError &&
    error.code === 7 &&
    typeof error.message === "string" &&
    error.message.startsWith("Proof rejected:")
  ) return "ANONCREDS_PROOF_INVALID";
  return error instanceof AnoncredsError
    ? "ANONCREDS_NATIVE_ERROR"
    : "ANONCREDS_INTERNAL_ERROR";
}

/**
 * One authorization decision across AnonCreds, Ed25519 PoP and delegated
 * capability verification. The challenge ledger only consumes after the
 * callback succeeds; the runtime consumes replay/quota state after all
 * cryptographic and policy checks have passed.
 */
export function verifyAndAuthorizeAgentRequest({
  nonce,
  presentationJson,
  capabilityChain,
  requestProof,
  trustedRootIssuer,
  expected,
  challengeLedger,
  verifierSchema,
  verifierCredentialDefinition,
  runtime = new AgentAuthorizationRuntime(),
  now = Math.floor(Date.now() / 1000),
}) {
  if (typeof nonce !== "string" || !nonce || !challengeLedger || !presentationJson) {
    return Object.freeze({ authorized: false, code: "INVALID_VERIFICATION_INPUT" });
  }
  if (verifierConfigurationError(verifierSchema, verifierCredentialDefinition)) {
    return Object.freeze({ authorized: false, code: "INVALID_VERIFIER_CONFIGURATION" });
  }

  const challenge = challengeLedger.get(nonce);
  if (!challenge) return Object.freeze({ authorized: false, code: "UNKNOWN_CHALLENGE" });
  if (challenge.consumed || challenge.expiresAt <= now) {
    return Object.freeze({ authorized: false, code: "CHALLENGE_EXPIRED_OR_CONSUMED" });
  }

  let authorization = null;
  let failureCode = null;
  const valid = challengeLedger.verifyAndConsume({
    nonce: challenge.nonce,
    audience: challenge.audience,
    task: challenge.task,
    capabilityDigest: challenge.capabilityDigest,
    now,
    verify: trustedRequestJson => {
      let presentation;
      try {
        presentation = Presentation.fromJson(presentationJson);
      } catch {
        failureCode = "ANONCREDS_PROOF_INVALID";
        return false;
      }

      let anonCredsValid = false;
      try {
        anonCredsValid = presentation.verify({
          presentationRequest: PresentationRequest.fromJson(trustedRequestJson),
          schemas: { [SCHEMA_ID]: verifierSchema },
          credentialDefinitions: {
            [CRED_DEF_ID]: verifierCredentialDefinition,
          },
        });
      } catch (error) {
        // Do not turn native initialization or unexpected internal failures
        // into a proof verdict. Return only a safe code; retain details in the
        // caller's diagnostic context rather than exposing credential data.
        failureCode = classifyVerificationError(error);
        return false;
      }
      if (!anonCredsValid) {
        failureCode = "ANONCREDS_PROOF_INVALID";
        return false;
      }

      let credentialKey;
      try {
        credentialKey = extractCredentialAgentPublicKey(presentationJson);
      } catch (error) {
        failureCode = error.code ?? "CREDENTIAL_KEY_INVALID";
        return false;
      }

      try {
        authorization = runtime.authorizeAndConsume({
          chain: capabilityChain,
          trustedRootIssuer,
          challenge,
          proof: requestProof,
          expected: { ...expected, delegateKey: credentialKey },
          now,
        });
        return true;
      } catch (error) {
        failureCode = error.code ?? "CAPABILITY_AUTHORIZATION_FAILED";
        return false;
      }
    },
  });

  if (!valid) {
    return Object.freeze({
      authorized: false,
      code: failureCode ?? "CHALLENGE_VERIFICATION_FAILED",
    });
  }
  return Object.freeze({ ...authorization, authorized: true });
}
