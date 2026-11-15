import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ChallengeLedger,
  makePresentationRequest,
} from "../index.mjs";
import { AgentAuthorizationRuntime } from "../agent-runtime.mjs";
import { SqliteAuthorizationStore } from "../authorization-store.mjs";
import { capabilityDigest } from "../capability.mjs";
import { verifyAndAuthorizeAgentRequest } from "../paai-verifier.mjs";
import { readJson, routeError, sendJson } from "./http.mjs";

const issuerUrl = process.env.ISSUER_URL ?? "http://127.0.0.1:4311";
const port = Number(process.env.PORT ?? 4313);
const host = process.env.HOST ?? "127.0.0.1";
const ledger = new ChallengeLedger();
const resourceByNonce = new Map();
const defaultAuthorizationDb = join(homedir(), ".local", "state", "anonymesh", "authorization.sqlite");
const authorizationDb = process.env.AUTHORIZATION_DB ?? defaultAuthorizationDb;
mkdirSync(dirname(authorizationDb), { recursive: true });
const authorizationStore = new SqliteAuthorizationStore({ filename: authorizationDb });
const runtime = new AgentAuthorizationRuntime({ store: authorizationStore });

const publicResponse = await fetch(issuerUrl + "/public");
if (!publicResponse.ok) throw new Error("Issuer public configuration unavailable");
const publicConfig = await publicResponse.json();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { role: "verifier", ready: true });
    }
    if (request.method === "POST" && url.pathname === "/challenge") {
      const body = await readJson(request);
      if (body.audience !== publicConfig.demoPolicy.audience ||
          body.task !== publicConfig.demoPolicy.action ||
          body.resource !== publicConfig.demoPolicy.resource) {
        return sendJson(response, 403, { error: "Requested scope is outside demo verifier policy" });
      }
      if (!Array.isArray(body.capabilityChain) || body.capabilityChain.length === 0) {
        return sendJson(response, 400, { error: "A capability chain is required" });
      }
      const leaf = body.capabilityChain[body.capabilityChain.length - 1];
      const digest = capabilityDigest(leaf);
      const challenge = ledger.issue({
        audience: body.audience,
        task: body.task,
        capabilityDigest: digest,
        ttlSeconds: body.ttlSeconds ?? 60,
      });
      const presentationRequest = makePresentationRequest(challenge).toJson();
      ledger.attachPresentationRequest(challenge.nonce, presentationRequest);
      resourceByNonce.set(challenge.nonce, body.resource);
      return sendJson(response, 200, { ...challenge, presentationRequest });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      const body = await readJson(request);
      if (typeof body.nonce !== "string" || !body.presentation ||
          !Array.isArray(body.capabilityChain) || !body.requestProof) {
        return sendJson(response, 400, { authorized: false, code: "INVALID_VERIFICATION_INPUT" });
      }
      const challenge = ledger.get(body.nonce);
      if (!challenge) return sendJson(response, 401, { authorized: false, code: "UNKNOWN_CHALLENGE" });
      const resource = resourceByNonce.get(body.nonce);
      if (!resource) return sendJson(response, 401, { authorized: false, code: "UNKNOWN_CHALLENGE_SCOPE" });

      const result = verifyAndAuthorizeAgentRequest({
        nonce: body.nonce,
        presentationJson: body.presentation,
        capabilityChain: body.capabilityChain,
        requestProof: body.requestProof,
        trustedRootIssuer: publicConfig.trustedRootIssuer,
        expected: {
          audience: challenge.audience,
          action: challenge.task,
          resource,
        },
        challengeLedger: ledger,
        verifierSchema: publicConfig.schema,
        verifierCredentialDefinition: publicConfig.credentialDefinition,
        runtime,
      });
      if (result.authorized) resourceByNonce.delete(body.nonce);
      return sendJson(response, result.authorized ? 200 : 401, result);
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return routeError(response, error);
  }
});

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "verifier", host, port }) + "\n"));
