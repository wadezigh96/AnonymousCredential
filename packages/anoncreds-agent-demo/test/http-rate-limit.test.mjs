import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, configuredRateLimit, requireBearerToken } from "../src/roles/http.mjs";

function responseRecorder({ headersSent = false, destroyed = false, writableEnded = false } = {}) {
  const headers = new Map();
  return {
    headers,
    status: null,
    body: null,
    headersSent,
    destroyed,
    writableEnded,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    writeHead(status) { this.status = status; this.headersSent = true; },
    end(body) { this.body = JSON.parse(body); this.writableEnded = true; },
    destroy() { this.destroyed = true; },
  };
}

const request = (address, authorization, extraHeaders = {}) => ({
  socket: { remoteAddress: address },
  headers: { ...extraHeaders, ...(authorization ? { authorization } : {}) },
});

test("rate limiter isolates remote IPs and returns 429 with Retry-After", () => {
  let timestamp = 10_000;
  const allow = createRateLimiter({ limit: 2, windowMs: 5_000, now: () => timestamp });
  assert.equal(allow(request("192.0.2.1"), responseRecorder()), true);
  assert.equal(allow(request("192.0.2.1"), responseRecorder()), true);
  const blocked = responseRecorder();
  assert.equal(allow(request("192.0.2.1"), blocked), false);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { error: "Too many requests" });
  assert.equal(blocked.headers.get("retry-after"), "5");
  assert.equal(allow(request("192.0.2.2"), responseRecorder()), true);
  timestamp += 5_000;
  assert.equal(allow(request("192.0.2.1"), responseRecorder()), true);
});

test("rate limiter normalizes IPv4-mapped IPv6 addresses", () => {
  const allow = createRateLimiter({ limit: 1, windowMs: 1_000 });
  assert.equal(allow(request("::ffff:192.0.2.8"), responseRecorder()), true);
  const blocked = responseRecorder();
  assert.equal(allow(request("192.0.2.8"), blocked), false);
  assert.equal(blocked.status, 429);
});

test("rate limiter rejects invalid configuration and bounds its key map", () => {
  assert.throws(() => createRateLimiter({ limit: 0 }), /positive integer/);
  assert.throws(() => createRateLimiter({ windowMs: 0 }), /positive integer/);
  const allow = createRateLimiter({ limit: 1, maxEntries: 1 });
  assert.equal(allow(request("192.0.2.1"), responseRecorder()), true);
  const blocked = responseRecorder();
  assert.equal(allow(request("192.0.2.2"), blocked), false);
  assert.equal(blocked.status, 503);
});

test("authentication failures are rate-limited independently of valid endpoint quota", async () => {
  let timestamp = 1_000;
  const failures = createRateLimiter({ limit: 2, windowMs: 1_000, now: () => timestamp });
  const endpoint = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => timestamp });
  for (let i = 0; i < 2; i += 1) {
    const response = responseRecorder();
    assert.equal(requireBearerToken(request("192.0.2.10", undefined), response, "correct-secret-value", { failureRateLimiter: failures }), false);
    assert.equal(response.status, 401);
  }
  const blockedAuth = responseRecorder();
  assert.equal(requireBearerToken(request("192.0.2.10", "Bearer wrong-secret"), blockedAuth, "correct-secret-value", { failureRateLimiter: failures }), false);
  assert.equal(blockedAuth.status, 429);

  // Invalid requests neither reserve nor consume the quota for valid requests.
  assert.equal(endpoint(request("192.0.2.10"), responseRecorder()), true);
  const valid = responseRecorder();
  assert.equal(requireBearerToken(request("192.0.2.10", "Bearer correct-secret-value"), valid, "correct-secret-value", { failureRateLimiter: failures }), true);
  assert.equal(endpoint(request("192.0.2.10"), responseRecorder()), false);
  assert.equal(valid.status, null);

  // Authentication failures from a different socket peer have an independent bucket.
  const otherIp = responseRecorder();
  assert.equal(requireBearerToken(request("192.0.2.11", null), otherIp, "correct-secret-value", { failureRateLimiter: failures }), false);
  assert.equal(otherIp.status, 401);

  timestamp += 1_000;
  const afterExpiry = responseRecorder();
  assert.equal(requireBearerToken(request("192.0.2.10", null), afterExpiry, "correct-secret-value", { failureRateLimiter: failures }), false);
  assert.equal(afterExpiry.status, 401);
});

test("concurrent invalid authentication attempts cannot exceed failure budget", async () => {
  const failures = createRateLimiter({ limit: 3, windowMs: 10_000 });
  const results = await Promise.all(Array.from({ length: 20 }, () => {
    const response = responseRecorder();
    const accepted = requireBearerToken(request("192.0.2.20", "Bearer invalid"), response, "correct-secret-value", { failureRateLimiter: failures });
    return { accepted, response };
  }));
  assert.equal(results.filter(result => result.response.status === 401).length, 3);
  assert.equal(results.filter(result => result.response.status === 429).length, 17);
  assert.equal(results.some(result => result.accepted), false);
});

test("X-Forwarded-For cannot choose the authentication-failure bucket", () => {
  const failures = createRateLimiter({ limit: 1, windowMs: 10_000 });
  const first = responseRecorder();
  requireBearerToken(request("192.0.2.30", "Bearer bad", { "x-forwarded-for": "203.0.113.1" }), first, "correct-secret-value", { failureRateLimiter: failures });
  assert.equal(first.status, 401);
  const second = responseRecorder();
  requireBearerToken(request("192.0.2.30", "Bearer bad", { "x-forwarded-for": "203.0.113.2" }), second, "correct-secret-value", { failureRateLimiter: failures });
  assert.equal(second.status, 429);
});

test("authentication limiter capacity exhaustion fails closed without blocking a valid token", () => {
  const failures = createRateLimiter({ limit: 1, maxEntries: 1, windowMs: 10_000 });
  const first = responseRecorder();
  requireBearerToken(request("192.0.2.40", "Bearer wrong"), first, "correct-secret-value", { failureRateLimiter: failures });
  assert.equal(first.status, 401);
  const overflow = responseRecorder();
  requireBearerToken(request("192.0.2.41", "Bearer wrong"), overflow, "correct-secret-value", { failureRateLimiter: failures });
  assert.equal(overflow.status, 503);
  const valid = responseRecorder();
  assert.equal(requireBearerToken(request("192.0.2.41", "Bearer correct-secret-value"), valid, "correct-secret-value", { failureRateLimiter: failures }), true);
  assert.equal(valid.status, null);
});

test("configured rate limits accept positive integers and reject invalid values", () => {
  const original = process.env.TEST_RATE_LIMIT;
  try {
    delete process.env.TEST_RATE_LIMIT;
    assert.equal(configuredRateLimit("TEST_RATE_LIMIT", 7), 7);
    process.env.TEST_RATE_LIMIT = "12";
    assert.equal(configuredRateLimit("TEST_RATE_LIMIT"), 12);
    process.env.TEST_RATE_LIMIT = "0";
    assert.throws(() => configuredRateLimit("TEST_RATE_LIMIT"), /positive integer/);
  } finally {
    if (original === undefined) delete process.env.TEST_RATE_LIMIT;
    else process.env.TEST_RATE_LIMIT = original;
  }
});
