import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { generateIssuerKeyFile } from "../src/issuer-key-store.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const TEST_TOKENS = Object.freeze({
  issuer: "test-issuer-token-anonymesh-0123456789abcdef",
  holder: "test-holder-token-anonymesh-0123456789abcdef",
  verifier: "test-verifier-token-anonymesh-0123456789abcdef",
});
const rolePath = name => resolve(here, "../src/roles", name + ".mjs");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}

async function startMockRegistry(recordHolder) {
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) {}
    if (recordHolder.available === false) {
      const payload = JSON.stringify({ error: "registry unavailable in integration test" });
      response.writeHead(503, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
      response.end(payload);
      return;
    }
    const result = Array.from(Buffer.from(JSON.stringify(recordHolder.record), "utf8"));
    const payload = JSON.stringify({ jsonrpc: "2.0", id: "anonymesh-registry", result: { result } });
    response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
    response.end(payload);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) };
}

async function assertConfiguredHeaderTimeout(port) {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  let response = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => { response += chunk; });
  const closed = once(socket, "close");
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nX-Incomplete:");
  await Promise.race([
    closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("configured HTTP header timeout did not close the socket")), 13_000).unref()),
  ]);
  assert.match(response, /^(?:HTTP\/1\.[01] 408|$)/);
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

async function post(url, body, authorization = "auto") {
  const path = new URL(url).pathname;
  const automaticToken = path === "/issue" ? TEST_TOKENS.issuer
    : ["/enroll", "/delegate", "/present"].includes(path) ? TEST_TOKENS.holder
    : ["/challenge", "/verify"].includes(path) ? TEST_TOKENS.verifier : null;
  const token = authorization === "auto" ? automaticToken : authorization;
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = "Bearer " + token;
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

test("separate issuer, holder and verifier processes enforce the complete PAII authorization flow", async () => {
  const issuerPort = await freePort();
  const holderPort = await freePort();
  const holderTwoPort = await freePort();
  const holderThreePort = await freePort();
  const verifierPort = await freePort();
  const verifierTwoPort = await freePort();
  const issuerUrl = "http://127.0.0.1:" + issuerPort;
  const holderUrl = "http://127.0.0.1:" + holderPort;
  const holderTwoUrl = "http://127.0.0.1:" + holderTwoPort;
  const holderThreeUrl = "http://127.0.0.1:" + holderThreePort;
  const verifierUrl = "http://127.0.0.1:" + verifierPort;
  const verifierTwoUrl = "http://127.0.0.1:" + verifierTwoPort;
  const children = [];
  const stateDirectory = mkdtempSync(join(tmpdir(), "anonymesh-verifier-restart-"));
  chmodSync(stateDirectory, 0o755);
  const stateDb = join(stateDirectory, "verifier-state.sqlite");
  const issuerKeyFile = join(stateDirectory, "issuer-key.json");
  generateIssuerKeyFile({ file: issuerKeyFile, keyVersion: 1 });
  const registryState = { record: null, available: true };
  const mockRegistry = await startMockRegistry(registryState);

  try {
    const issuer = start("issuer", issuerPort, { ISSUER_API_TOKEN: TEST_TOKENS.issuer, ISSUER_KEY_FILE: issuerKeyFile, NODE_ENV: "test", NEAR_EXPECTED_KEY_VERSION: "1" });
    children.push(issuer);
    await waitHealthy(issuerUrl, issuer);
    const issuerPublic = await (await fetch(issuerUrl + "/public")).json();
    assert.match(issuerPublic.issuerRegistryPublicKey, /^ed25519:[1-9A-HJ-NP-Za-km-z]+$/);
    registryState.record = { public_key: issuerPublic.issuerRegistryPublicKey, key_version: 1, schema_hash: issuerPublic.schemaHash, active: true, status_epoch: 0, status_root: "0".repeat(64) };

    const holder = start("holder", holderPort, { ISSUER_URL: issuerUrl, ISSUER_API_TOKEN: TEST_TOKENS.issuer, HOLDER_API_TOKEN: TEST_TOKENS.holder });
    children.push(holder);
    await waitHealthy(holderUrl, holder);
    const holderTwo = start("holder", holderTwoPort, { ISSUER_URL: issuerUrl, ISSUER_API_TOKEN: TEST_TOKENS.issuer, HOLDER_API_TOKEN: TEST_TOKENS.holder });
    children.push(holderTwo);
    await waitHealthy(holderTwoUrl, holderTwo);
    const holderThree = start("holder", holderThreePort, { ISSUER_URL: issuerUrl, ISSUER_API_TOKEN: TEST_TOKENS.issuer, HOLDER_API_TOKEN: TEST_TOKENS.holder });
    children.push(holderThree);
    await waitHealthy(holderThreeUrl, holderThree);

    const verifierEnvironment = { ISSUER_URL: issuerUrl, STATE_DB: stateDb, VERIFIER_API_TOKEN: TEST_TOKENS.verifier, NEAR_REQUIRED: "true", NEAR_NETWORK: "local", NEAR_REGISTRY_CONTRACT: "registry.testnet", NEAR_RPC_URL: mockRegistry.url, NEAR_ISSUER_ACCOUNT_ID: issuerPublic.issuerAccountId, NEAR_EXPECTED_KEY_VERSION: "1", NEAR_EXPECTED_SCHEMA_HASH: issuerPublic.schemaHash, NEAR_EXPECTED_STATUS_EPOCH: "0", NEAR_CACHE_TTL_MS: "600000", NEAR_MAX_STALE_AGE_MS: "600000" };
    const verifier = start("verifier", verifierPort, verifierEnvironment);
    children.push(verifier);
    await waitHealthy(verifierUrl, verifier);
    assert.equal(statSync(stateDb).mode & 0o777, 0o600, "SQLite authorization state must not be readable by other local users");
    const verifierTwo = start("verifier", verifierTwoPort, verifierEnvironment);
    children.push(verifierTwo);
    await waitHealthy(verifierTwoUrl, verifierTwo);

    // Exercise Node's actual configured headersTimeout on each independently
    // running role server, rather than only asserting timeout property values.
    await Promise.all([
      assertConfiguredHeaderTimeout(issuerPort),
      assertConfiguredHeaderTimeout(holderPort),
      assertConfiguredHeaderTimeout(verifierPort),
    ]);

    // Mutating endpoints reject missing and incorrect bearer credentials before
    // parsing bodies or performing issuance, wallet, challenge, or proof work.
    const protectedEndpoints = [
      [issuerUrl + "/issue", TEST_TOKENS.issuer],
      [holderUrl + "/enroll", TEST_TOKENS.holder],
      [holderUrl + "/delegate", TEST_TOKENS.holder],
      [holderUrl + "/present", TEST_TOKENS.holder],
      [verifierUrl + "/challenge", TEST_TOKENS.verifier],
      [verifierUrl + "/verify", TEST_TOKENS.verifier],
    ];
    for (const [endpoint, expectedToken] of protectedEndpoints) {
      for (const suppliedToken of [null, "incorrect-token-anonymesh-0123456789"]) {
        const rejected = await post(endpoint, {}, suppliedToken);
        assert.equal(rejected.status, 401, endpoint);
        assert.deepEqual(rejected.body, { error: "Unauthorized" });
        assert.match(rejected.headers.get("www-authenticate") ?? "", /^Bearer /);
        assert.equal(JSON.stringify(rejected.body).includes(expectedToken), false);
      }
    }
    // The issuer's dedicated failure bucket saturates on the same client IP;
    // a later legitimate holder issuance must still pass authentication.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      assert.equal((await post(issuerUrl + "/issue", {}, "invalid-token")).status, 401);
    }
    assert.equal((await post(issuerUrl + "/issue", {}, "invalid-token")).status, 429);
    assert.equal((await fetch(issuerUrl + "/public")).status, 200);
    assert.equal((await fetch(verifierUrl + "/health")).status, 200);

    const secondEnrollment = await post(holderTwoUrl + "/enroll", {});
    assert.equal(secondEnrollment.status, 200, JSON.stringify(secondEnrollment.body));
    const secondDelegation = await post(holderTwoUrl + "/delegate", {});
    assert.equal(secondDelegation.status, 200, JSON.stringify(secondDelegation.body));
    const thirdEnrollment = await post(holderThreeUrl + "/enroll", {});
    assert.equal(thirdEnrollment.status, 200, JSON.stringify(thirdEnrollment.body));
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
    for (const statePath of [stateDb, `${stateDb}-wal`, `${stateDb}-shm`]) {
      if (existsSync(statePath)) assert.equal(statSync(statePath).mode & 0o777, 0o600, `${statePath} must be private`);
    }

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

    // Warm the verifier's registry cache with a valid, independent authorization.
    const warmChallenge = await post(verifierUrl + "/challenge", {
      ...challengeInput,
      capabilityChain: thirdEnrollment.body.capabilityChain,
    });
    assert.equal(warmChallenge.status, 200, JSON.stringify(warmChallenge.body));
    const warmPresentation = await post(holderThreeUrl + "/present", {
      challenge: warmChallenge.body,
      presentationRequest: warmChallenge.body.presentationRequest,
    });
    assert.equal(warmPresentation.status, 200, JSON.stringify(warmPresentation.body));
    const warmAttempt = await post(verifierUrl + "/verify", {
      nonce: warmChallenge.body.nonce,
      ...warmPresentation.body,
    });
    assert.equal(warmAttempt.status, 200, JSON.stringify(warmAttempt.body));

    // A transient registry failure must not use stale cache, consume the
    // challenge, or authorize the request even when a stale-cache env value is set.
    registryState.available = false;
    const registryUnavailableAttempt = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
    });
    assert.equal(registryUnavailableAttempt.status, 401);
    assert.equal(registryUnavailableAttempt.body.authorized, false);
    assert.equal(registryUnavailableAttempt.body.code, "RPC_HTTP_UNAVAILABLE");
    registryState.available = true;

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

    // Stop and restart the verifier with the same SQLite files. The consumed
    // challenge must remain known and rejected instead of becoming UNKNOWN_CHALLENGE.
    verifier.kill("SIGTERM");
    await once(verifier, "exit");
    const restartedVerifier = start("verifier", verifierPort, verifierEnvironment);
    children.push(restartedVerifier);
    await waitHealthy(verifierUrl, restartedVerifier);
    const replayAfterRestart = await post(verifierUrl + "/verify", {
      nonce: challengeResult.body.nonce,
      ...proofBundle,
    });
    assert.equal(replayAfterRestart.status, 401);
    assert.equal(replayAfterRestart.body.authorized, false);
    assert.equal(replayAfterRestart.body.code, "CHALLENGE_EXPIRED_OR_CONSUMED");

    // A fresh challenge cannot reset the capability quota after verifier restart.
    // Reuse the exact capability whose one-unit quota was consumed above.
    const quotaChallenge = await post(verifierUrl + "/challenge", challengeInput);
    assert.equal(quotaChallenge.status, 200, JSON.stringify(quotaChallenge.body));
    const quotaPresentation = await post(holderUrl + "/present", {
      challenge: quotaChallenge.body,
      presentationRequest: quotaChallenge.body.presentationRequest,
    });
    assert.equal(quotaPresentation.status, 200, JSON.stringify(quotaPresentation.body));
    const exhaustedQuotaAttempt = await post(verifierUrl + "/verify", {
      nonce: quotaChallenge.body.nonce,
      ...quotaPresentation.body,
    });
    assert.equal(exhaustedQuotaAttempt.status, 401, JSON.stringify(exhaustedQuotaAttempt.body));
    assert.equal(exhaustedQuotaAttempt.body.authorized, false);
    assert.equal(exhaustedQuotaAttempt.body.code, "CAPABILITY_QUOTA_EXHAUSTED");
    // A rejected authorization must not consume the new challenge.
    const quotaChallengeRetry = await post(verifierUrl + "/verify", {
      nonce: quotaChallenge.body.nonce,
      ...quotaPresentation.body,
    });
    assert.equal(quotaChallengeRetry.status, 401);
    assert.equal(quotaChallengeRetry.body.code, "CAPABILITY_QUOTA_EXHAUSTED");

    // Two independent verifier processes share the same SQLite files.
    // Simultaneous submissions of one fresh challenge must authorize exactly once.
    const concurrentChain = secondDelegation.body.capabilityChain;
    const concurrentChallenge = await post(verifierUrl + "/challenge", {
      ...challengeInput,
      capabilityChain: concurrentChain,
    });
    assert.equal(concurrentChallenge.status, 200, JSON.stringify(concurrentChallenge.body));
    const concurrentPresentation = await post(holderTwoUrl + "/present", {
      challenge: concurrentChallenge.body,
      presentationRequest: concurrentChallenge.body.presentationRequest,
    });
    assert.equal(concurrentPresentation.status, 200, JSON.stringify(concurrentPresentation.body));
    const concurrentBody = {
      nonce: concurrentChallenge.body.nonce,
      ...concurrentPresentation.body,
    };
    const concurrentResults = await Promise.all([
      post(verifierUrl + "/verify", concurrentBody),
      post(verifierTwoUrl + "/verify", concurrentBody),
    ]);
    assert.equal(concurrentResults.filter(result => result.status === 200 && result.body.authorized).length, 1,
      JSON.stringify(concurrentResults));
    assert.equal(concurrentResults.filter(result => result.status === 401 && !result.body.authorized).length, 1,
      JSON.stringify(concurrentResults));

    // A separately configured verifier enforces independent challenge and
    // verification request budgets and emits Retry-After when a bucket is full.
    const rateLimitedPort = await freePort();
    const rateLimitedUrl = "http://127.0.0.1:" + rateLimitedPort;
    const rateLimitedVerifier = start("verifier", rateLimitedPort, {
      ...verifierEnvironment,
      VERIFIER_CHALLENGE_RATE_LIMIT: "2",
      VERIFIER_VERIFY_RATE_LIMIT: "2",
    });
    children.push(rateLimitedVerifier);
    await waitHealthy(rateLimitedUrl, rateLimitedVerifier);
    const limitedChallengeInput = { ...challengeInput, capabilityChain: secondDelegation.body.capabilityChain };
    const limitedChallenges = await Promise.all([
      post(rateLimitedUrl + "/challenge", limitedChallengeInput),
      post(rateLimitedUrl + "/challenge", limitedChallengeInput),
    ]);
    assert.deepEqual(limitedChallenges.map(result => result.status), [200, 200]);
    const excessChallenge = await post(rateLimitedUrl + "/challenge", limitedChallengeInput);
    assert.equal(excessChallenge.status, 429);
    assert.equal(excessChallenge.body.error, "Too many requests");
    assert.ok(Number(excessChallenge.headers.get("retry-after")) >= 1);
    const limitedVerifications = await Promise.all([
      post(rateLimitedUrl + "/verify", {}),
      post(rateLimitedUrl + "/verify", {}),
    ]);
    assert.deepEqual(limitedVerifications.map(result => result.status), [400, 400]);
    const excessVerification = await post(rateLimitedUrl + "/verify", {});
    assert.equal(excessVerification.status, 429);
    assert.equal(excessVerification.body.error, "Too many requests");
    assert.equal((await fetch(rateLimitedUrl + "/health")).status, 200);

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
    rmSync(stateDirectory, { recursive: true, force: true });
    await mockRegistry.close();
  }
});

test("issuer refuses registry-required mode without a persisted issuer key", async () => {
  const port = await freePort();
  const child = start("issuer", port, {
    NEAR_REQUIRED: "true",
    ISSUER_KEY_FILE: "",
    NODE_ENV: "test",
  });
  try {
    const [code] = await once(child, "exit");
    assert.notEqual(code, 0);
    assert.match(child.diagnosticOutput(), /ISSUER_KEY_FILE_REQUIRED_WHEN_NEAR_REQUIRED/);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
});
