import { Presentation, PresentationRequest } from "@hyperledger/anoncreds-nodejs";
import { extractCredentialAgentPublicKey } from "./agent-key-binding.mjs";
import { AgentAuthorizationRuntime } from "./agent-runtime.mjs";

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
      let anonCredsValid = false;
      try {
        anonCredsValid = Presentation.fromJson(presentationJson).verify({
          presentationRequest: PresentationRequest.fromJson(trustedRequestJson),
          schemas: { [verifierSchema.id ?? "anonymesh:agent-authorization:1"]: verifierSchema },
          credentialDefinitions: {
            ["anonymesh:agent-authorization:1:CL"]: verifierCredentialDefinition,
          },
        });
      } catch {
        failureCode = "ANONCREDS_PROOF_MALFORMED";
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
