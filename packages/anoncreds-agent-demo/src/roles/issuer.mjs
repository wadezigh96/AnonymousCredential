import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { createIssuerSetup, issueCredentialForRequest } from "../index.mjs";
import { signCapability } from "../capability.mjs";
import { readJson, requireApiToken, requireBearerToken, routeError, sendJson } from "./http.mjs";

const config = createIssuerSetup();
const authorizationRoot = generateKeyPairSync("ed25519");
const trustedRootIssuer = authorizationRoot.publicKey.export({ format: "jwk" }).x;
const port = Number(process.env.PORT ?? 4311);
const host = process.env.HOST ?? "127.0.0.1";
const issueToken = requireApiToken("ISSUER_API_TOKEN");

// Deliberately narrow demo policy. This issuer is a local reference fixture,
// not a remotely exposed production authorization authority.
const DEMO_POLICY = Object.freeze({
  audience: "agent-b.anonymesh.integration",
  action: "read:weather",
  resource: "weather:singapore",
  quota: 2,
});

const server = createServer(async (request, response) => {
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
        demoPolicy: DEMO_POLICY,
      });
    }
    if (request.method === "POST" && url.pathname === "/issue") {
      if (!requireBearerToken(request, response, issueToken)) return;
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
});

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "issuer", host, port }) + "\n"));
