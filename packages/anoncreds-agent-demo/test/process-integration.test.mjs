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
  const startupDeadline = Date.now() + 20_000;
  while (Date.now() < startupDeadline) {
    if (child.exitCode !== null) throw new Error("Service exited before becoming healthy");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 500);
    try {
      const response = await fetch(url + "/health", { signal: controller.signal });
      if (response.ok && (await response.json()).ready === true && child.exitCode === null) return;
    } catch {}
    finally { clearTimeout(timeout); }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("Service did not become healthy: " + url + "\n" + child.diagnosticOutput());
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

test("separate issuer, holder and verifier processes enforce the complete PAII authorization flow", async () => {
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
    const { policy } = enrollment.body;
    assert.equal(enrollment.body.capabilityChain.length, 1);
    const delegation = await post(holderUrl + "/delegate", {});
    assert.equal(delegation.status, 200, JSON.stringify(delegation.body));
    const capabilityChain = delegation.body.capabilityChain;
    assert.equal(capabilityChain.length, 2);
    assert.notEqual(delegation.body.delegatePublicKey, enrollment.body.agentPublicKey);
    assert.equal(delegation.body.delegationDepth, 1);

    const challengeInput = {
      audience: policy.audience,
      task: policy.action,
      resource: policy.resource,
      capabilityChain,
      ttlSeconds: 90,
    };
    const challengeResult = await post(verifierUrl + "/challenge", challengeInput);
    assert.equal(challengeResult.status, 200, JSON.stringify(challengeResult.body));

    const presentationResult = await post(holderUrl + "/present", {
      challenge: challengeResult.body,
      presentationRequest: challengeResult.body.presentationRequest,
    });
    assert.equal(presentationResult.status, 200, JSON.stringify(presentationResult.body));
    const proofBundle = presentationResult.body;
    assert.equal(JSON.stringify(proofBundle.presentation).includes("agent-a-private-subject-7f3a"), false);

    // A presentation and PoP generated for another challenge cannot authorize this nonce.
    const secondChallenge = await post(verifierUrl + "/challenge", challengeInput);
    assert.equal(secondChallenge.status, 200);
    const wrongChallengeBundle = await post(holderUrl + "/present", {
      challenge: secondChallenge.body,
      presentationRequest: secondChallenge.body.presentationRequest,
    });
    assert.equal(wrongChallengeBundle.status, 200);
    const wrongChallengeAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...wrongChallengeBundle.body,
    });
    assert.equal(wrongChallengeAttempt.status, 401);
    assert.equal(wrongChallengeAttempt.body.authorized, false);

    // A forged PoP is rejected and does not burn the original challenge or quota.
    const forgedProof = {
      ...proofBundle.requestProof,
      signature: Buffer.alloc(64).toString("base64url"),
    };
    const forgedAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
      requestProof: forgedProof,
    });
    assert.equal(forgedAttempt.status, 401);
    assert.equal(forgedAttempt.body.code, "INVALID_REQUEST_SIGNATURE");

    // The genuine AnonCreds proof + credential-bound PoP + capability is accepted once.
    const validAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
    });
    assert.equal(validAttempt.status, 200, JSON.stringify(validAttempt.body));
    assert.equal(validAttempt.body.authorized, true);
    assert.equal(validAttempt.body.action, policy.action);
    assert.equal(validAttempt.body.resource, policy.resource);
    // Delegation attenuates the root quota to one unit; consuming it leaves zero.
    assert.equal(validAttempt.body.remainingQuota, 0);

    // Replaying the same challenge is denied.
    const replayAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
    });
    assert.equal(replayAttempt.status, 401);
    assert.equal(replayAttempt.body.authorized, false);

    // A tampered delegated capability is rejected, and the same challenge
    // remains usable with the authentic chain and proof.
    const tamperedChain = structuredClone(capabilityChain);
    tamperedChain[1].action = "transfer:funds";
    const tamperedAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
      capabilityChain: tamperedChain,
    });
    assert.equal(tamperedAttempt.status, 401);
    assert.equal(tamperedAttempt.body.authorized, false);
    assert.equal(tamperedAttempt.body.code, "INVALID_SIGNATURE");

    // The fixed issuer policy rejects an unapproved resource, action, or audience.
    for (const override of [
      { resource: "weather:all" },
      { task: "transfer:funds" },
      { audience: "agent-c.anonymesh.integration" },
    ]) {
      const escalationAttempt = await post(verifierUrl + "/challenge", {
        ...challengeInput,
        ...override,
      });
      assert.equal(escalationAttempt.status, 403, JSON.stringify(override));
    }
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
