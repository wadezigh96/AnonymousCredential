import { createServer } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import {
  createHolderCredentialRequest,
  createPresentationFromWallet,
  processHolderCredential,
} from "../index.mjs";
import { createAgentRequestProof } from "../agent-runtime.mjs";
import { readJson, routeError, sendJson } from "./http.mjs";

const issuerUrl = process.env.ISSUER_URL ?? "http://127.0.0.1:4311";
const port = Number(process.env.PORT ?? 4312);
const host = process.env.HOST ?? "127.0.0.1";
let wallet = null;

async function enroll() {
  const publicResponse = await fetch(issuerUrl + "/public");
  if (!publicResponse.ok) throw new Error("Issuer public configuration unavailable");
  const publicConfig = await publicResponse.json();
  const { linkSecret, credentialRequest, credentialRequestMetadata } =
    createHolderCredentialRequest({ publicConfig, offer: publicConfig.offer });
  const agentKeyPair = generateKeyPairSync("ed25519");
  const agentPublicKey = agentKeyPair.publicKey.export({ format: "jwk" }).x;
  const issuedResponse = await fetch(issuerUrl + "/issue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ credentialRequest, agentPublicKey }),
  });
  if (!issuedResponse.ok) throw new Error("Issuer rejected holder credential request");
  const { credential, capabilityChain } = await issuedResponse.json();
  if (!Array.isArray(capabilityChain) || capabilityChain.length === 0) {
    throw new Error("Issuer did not return an authorization capability");
  }
  const credentialJson = processHolderCredential({
    credentialJson: credential,
    credentialRequestMetadata,
    linkSecret,
    publicConfig,
  });
  wallet = {
    linkSecret, credentialJson, publicConfig, agentKeyPair,
    agentPublicKey, capabilityChain,
  };
  return {
    enrolled: true,
    agentPublicKey,
    capabilityChain,
    policy: publicConfig.demoPolicy,
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { role: "holder", ready: true, enrolled: Boolean(wallet) });
    }
    if (request.method === "POST" && url.pathname === "/enroll") {
      if (wallet) return sendJson(response, 409, { error: "Holder already enrolled" });
      return sendJson(response, 200, await enroll());
    }
    if (request.method === "POST" && url.pathname === "/present") {
      if (!wallet) return sendJson(response, 409, { error: "Holder is not enrolled" });
      const body = await readJson(request);
      if (!body.presentationRequest || !body.challenge) {
        throw new Error("presentationRequest and challenge are required");
      }
      const presentation = createPresentationFromWallet({
        credentialJson: wallet.credentialJson,
        linkSecret: wallet.linkSecret,
        publicConfig: wallet.publicConfig,
        presentationRequestJson: body.presentationRequest,
      });
      const requestProof = createAgentRequestProof({
        challenge: body.challenge,
        capabilityChain: wallet.capabilityChain,
        privateKey: wallet.agentKeyPair.privateKey,
      });
      return sendJson(response, 200, {
        presentation,
        capabilityChain: wallet.capabilityChain,
        requestProof,
      });
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return routeError(response, error);
  }
});

server.listen(port, host, () => process.stdout.write(JSON.stringify({ role: "holder", host, port }) + "\n"));
