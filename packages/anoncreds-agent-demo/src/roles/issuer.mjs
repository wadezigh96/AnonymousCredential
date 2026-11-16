import { createServer } from "node:http";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createIssuerSetup, issueCredentialForRequest } from "../index.mjs";
import { signCapability } from "../capability.mjs";
import { configureHttpServer, configuredRateLimit, createRateLimiter, readJson, requireApiToken, requireBearerToken, routeError, sendJson } from "./http.mjs";
import { loadIssuerKey } from "../issuer-key-store.mjs";
import { loadOrCreateIssuerState } from "../issuer-state-store.mjs";
import { nodeEd25519PublicKeyToNear } from "../near-key-format.mjs";

const issuerAccountId = process.env.NEAR_ISSUER_ACCOUNT_ID ?? "issuer.testnet";
const issuerKeyVersion = Number(process.env.NEAR_EXPECTED_KEY_VERSION ?? 1);
const issuerKeyFile = process.env.ISSUER_KEY_FILE;
const issuerStateFile = process.env.ISSUER_STATE_FILE;
const nearRequired = process.env.NEAR_REQUIRED === "true";
const production = process.env.NODE_ENV === "production";

if (!Number.isSafeInteger(issuerKeyVersion) || issuerKeyVersion < 1) {
  throw new Error("INVALID_ISSUER_KEY_VERSION");
}

if ((nearRequired || production) && !issuerKeyFile) {
  throw new Error("ISSUER_KEY_FILE_REQUIRED_WHEN_NEAR_REQUIRED");
}

if ((nearRequired || production) && !issuerStateFile) {
  throw new Error("ISSUER_STATE_FILE_REQUIRED_WHEN_NEAR_REQUIRED");
}

if (issuerStateFile && !issuerKeyFile) {
  throw new Error("ISSUER_KEY_FILE_REQUIRED_WHEN_STATE_PERSISTED");
}

const issuerKey = issuerKeyFile
  ? loadIssuerKey({
      file: issuerKeyFile,
      expectedKeyVersion: issuerKeyVersion,
      strictPermissions: process.env.NODE_ENV !== "test",
      allowCreate: !production && process.env.ANONYMESH_DEVELOPMENT_MODE === "true",
    })
  : (() => {
      const pair = generateKeyPairSync("ed25519");
      return {
        privateKey: pair.privateKey,
        publicKey: pair.publicKey.export({ format: "jwk" }).x,
        keyVersion: issuerKeyVersion,
      };
    })();

const issuerRegistryPublicKey = nodeEd25519PublicKeyToNear(issuerKey.publicKey);

const issuerState = issuerStateFile
  ? loadOrCreateIssuerState({
      file: issuerStateFile,
      issuerKeyVersion,
      issuerRegistryPublicKey,
      createConfig: () =>
        createIssuerSetup({
          issuerRegistryPublicKey,
        }),
      allowCreate:
        !nearRequired &&
        !production &&
        process.env.ISSUER_STATE_ALLOW_CREATE === "true",
      strictPermissions: process.env.NODE_ENV !== "test",
    })
  : null;

const config =
  issuerState?.config ??
  createIssuerSetup({ issuerRegistryPublicKey });

const schemaHash = createHash("sha256")
  .update(JSON.stringify(config.schema), "utf8")
  .digest("hex");

const ephemeralAuthorizationRoot = issuerState
  ? null
  : generateKeyPairSync("ed25519");

const authorizationRoot = issuerState?.authorizationRoot ?? {
  privateKey: ephemeralAuthorizationRoot.privateKey,
  publicKey: ephemeralAuthorizationRoot.publicKey.export({ format: "jwk" }).x,
};

const trustedRootIssuer = authorizationRoot.publicKey;
const port = Number(process.env.PORT ?? 4311);
const host = process.env.HOST ?? "127.0.0.1";
const issueToken = requireApiToken("ISSUER_API_TOKEN");
const rateLimitWindow = configuredRateLimit("RATE_LIMIT_WINDOW_MS", 60_000);
const authenticationFailureRateLimit = createRateLimiter({
  limit: configuredRateLimit("ISSUER_AUTH_FAILURE_RATE_LIMIT", 10),
  windowMs: rateLimitWindow,
});
const issueRateLimit = createRateLimiter({
  limit: configuredRateLimit("ISSUER_ISSUE_RATE_LIMIT"),
  windowMs: rateLimitWindow,
});

// Deliberately narrow demo policy. This issuer is a local reference fixture,
// not a remotely exposed production authorization authority.
const DEMO_POLICY = Object.freeze({
  audience: "agent-b.anonymesh.integration",
  action: "read:weather",
  resource: "weather:singapore",
  quota: 2,
});

const server = configureHttpServer(createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { role: "issuer", ready: true });
    }
    if (request.method === "GET" && url.pathname === "/public") {
      return sendJson(response, 200, {
        schema: config.schema,
        credentialDefinition: config.credentialDefinition,
        offer: config.offer,
        trustedRootIssuer,
        issuerAccountId,
        issuerRegistryPublicKey: config.issuerRegistryPublicKey,
        issuerKeyVersion,
        schemaHash,
        demoPolicy: DEMO_POLICY,
      });
    }
    if (request.method === "POST" && url.pathname === "/issue") {
      if (!requireBearerToken(request, response, issueToken, { failureRateLimiter: authenticationFailureRateLimit })) return;
      if (!issueRateLimit(request, response)) return;
      const body = await readJson(request);
      const now = Math.floor(Date.now() / 1000);
      const validUntil = now + 3600;
      const credential = issueCredentialForRequest({
        issuerConfig: config,
        credentialRequest: body.credentialRequest,
        agentPublicKey: body.agentPublicKey,
        validUntil,
      });
      const capability = signCapability({
        parentDigest: null,
        issuerKey: trustedRootIssuer,
        delegateKey: body.agentPublicKey,
        audience: DEMO_POLICY.audience,
        action: DEMO_POLICY.action,
        resource: DEMO_POLICY.resource,
        expiresAt: validUntil,
        quota: DEMO_POLICY.quota,
      }, authorizationRoot.privateKey);
      return sendJson(response, 200, { credential, capabilityChain: [capability] });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return routeError(response, error);
  }
}));

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "issuer", host, port }) + "\n"));
