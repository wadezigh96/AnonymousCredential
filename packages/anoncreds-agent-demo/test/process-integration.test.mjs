import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const rolePath = name => resolve(here, "../src/roles", name + ".mjs");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}

async function waitHealthy(url, child) {
  for (let i = 0; i < 80; i += 1) {
    if (child.exitCode !== null) throw new Error("Service exited before becoming healthy");
    try {
      const response = await fetch(url + "/health");
      if (response.ok) return;
    } catch {}
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("Service did not become healthy: " + url);
}

function start(name, port, extra = {}) {
  const child = spawn(process.execPath, [rolePath(name)], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  child.stderr.on("data", chunk => { output += chunk.toString(); });
  child.diagnosticOutput = () => output;
  return child;
}

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test("issuer, holder and verifier run as separate processes; invalid proof does not burn nonce", async () => {
  const issuerPort = await freePort();
  const holderPort = await freePort();
  const verifierPort = await freePort();
  const issuerUrl = "http://127.0.0.1:" + issuerPort;
  const holderUrl = "http://127.0.0.1:" + holderPort;
  const verifierUrl = "http://127.0.0.1:" + verifierPort;
  const children = [];

  try {
    const issuer = start("issuer", issuerPort);
    children.push(issuer);
    await waitHealthy(issuerUrl, issuer);

    const holder = start("holder", holderPort, { ISSUER_URL: issuerUrl });
    children.push(holder);
    await waitHealthy(holderUrl, holder);

    const verifier = start("verifier", verifierPort, { ISSUER_URL: issuerUrl });
    children.push(verifier);
    await waitHealthy(verifierUrl, verifier);

    const enrollment = await post(holderUrl + "/enroll", {});
    assert.equal(enrollment.status, 200, JSON.stringify(enrollment.body));

    const challengeResult = await post(verifierUrl + "/challenge", {
      audience: "agent-b.anonymesh.integration",
      task: "read:weather",
      capabilityDigest: "sha256:integration-capability",
      ttlSeconds: 90,
    });
    assert.equal(challengeResult.status, 200, JSON.stringify(challengeResult.body));

    const presentationResult = await post(holderUrl + "/present", {
      presentationRequest: challengeResult.body.presentationRequest,
    });
    assert.equal(presentationResult.status, 200, JSON.stringify(presentationResult.body));
    const presentation = presentationResult.body.presentation;
    assert.equal(JSON.stringify(presentation).includes("agent-a-private-subject-7f3a"), false);

    // A proof made for a different verifier nonce must fail against the first
    // challenge's server-stored request, without consuming the first challenge.
    const secondChallenge = await post(verifierUrl + "/challenge", {
      audience: "agent-b.anonymesh.integration",
      task: "read:weather",
      capabilityDigest: "sha256:integration-capability",
      ttlSeconds: 90,
    });
    assert.equal(secondChallenge.status, 200);
    const wrongNoncePresentation = await post(holderUrl + "/present", {
      presentationRequest: secondChallenge.body.presentationRequest,
    });
    assert.equal(wrongNoncePresentation.status, 200);
    const invalidAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      presentation: wrongNoncePresentation.body.presentation,
    });
    assert.equal(invalidAttempt.status, 401);
    assert.equal(invalidAttempt.body.valid, false);

    // The exact same still-pending challenge accepts the authentic proof once.
    const validAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      presentation,
    });
    assert.equal(validAttempt.status, 200, JSON.stringify(validAttempt.body));
    assert.equal(validAttempt.body.valid, true);

    const replayAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      presentation,
    });
    assert.equal(replayAttempt.status, 401);
    assert.equal(replayAttempt.body.valid, false);
  } catch (error) {
    const diagnostics = children.map(child => child.diagnosticOutput()).join("\n");
    throw new Error(String(error) + "\nService logs:\n" + diagnostics);
  } finally {
    for (const child of children) child.kill("SIGTERM");
    await Promise.all(children.map(child => new Promise(resolveDone => {
      if (child.exitCode !== null) return resolveDone();
      child.once("exit", resolveDone);
      setTimeout(() => { child.kill("SIGKILL"); resolveDone(); }, 1500).unref();
    })));
  }
});
