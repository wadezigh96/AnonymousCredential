import { createServer } from "node:http";
import { createIssuerSetup, issueCredentialForRequest } from "../index.mjs";
import { readJson, routeError, sendJson } from "./http.mjs";

const config = createIssuerSetup();
const port = Number(process.env.PORT ?? 4311);
const host = process.env.HOST ?? "127.0.0.1";

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") return sendJson(response, 200, { role: "issuer", ready: true });
    if (request.method === "GET" && url.pathname === "/public") {
      return sendJson(response, 200, {
        schema: config.schema,
        credentialDefinition: config.credentialDefinition,
        offer: config.offer,
      });
    }
    if (request.method === "POST" && url.pathname === "/issue") {
      const body = await readJson(request);
      const credential = issueCredentialForRequest({
        issuerConfig: config,
        credentialRequest: body.credentialRequest,
        agentPublicKey: body.agentPublicKey,
        validUntil: Math.floor(Date.now() / 1000) + 3600,
      });
      return sendJson(response, 200, { credential });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return routeError(response, error);
  }
});

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "issuer", host, port }) + "\n"));
