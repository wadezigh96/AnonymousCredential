import { createServer } from "node:http";
import {
  ChallengeLedger,
  makePresentationRequest,
  verifyAgentPresentation,
} from "../index.mjs";
import { readJson, routeError, sendJson } from "./http.mjs";

const issuerUrl = process.env.ISSUER_URL ?? "http://127.0.0.1:4311";
const port = Number(process.env.PORT ?? 4313);
const host = process.env.HOST ?? "127.0.0.1";
const ledger = new ChallengeLedger();
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
      const challenge = ledger.issue({
        audience: body.audience,
        task: body.task,
        capabilityDigest: body.capabilityDigest,
        ttlSeconds: body.ttlSeconds ?? 60,
      });
      const presentationRequest = makePresentationRequest(challenge).toJson();
      ledger.attachPresentationRequest(challenge.nonce, presentationRequest);
      return sendJson(response, 200, { ...challenge, presentationRequest });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      const body = await readJson(request);
      if (typeof body.nonce !== "string" || !body.presentation) {
        return sendJson(response, 400, { error: "nonce and presentation are required" });
      }
      const challenge = ledger.get(body.nonce);
      if (!challenge) return sendJson(response, 401, { valid: false, error: "Unknown challenge" });
      if (challenge.consumed || challenge.expiresAt <= Math.floor(Date.now() / 1000)) {
        return sendJson(response, 401, { valid: false, error: "Challenge expired or already consumed" });
      }
      const valid = verifyAgentPresentation({
        presentationJson: body.presentation,
        presentationRequestJson: challenge.presentationRequest,
        verifierSchema: publicConfig.schema,
        verifierCredentialDefinition: publicConfig.credentialDefinition,
        challengeLedger: ledger,
        challengeContext: {
          nonce: challenge.nonce,
          audience: challenge.audience,
          task: challenge.task,
          capabilityDigest: challenge.capabilityDigest,
        },
      });
      return sendJson(response, valid ? 200 : 401, { valid });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return routeError(response, error);
  }
});

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "verifier", host, port }) + "\n"));
