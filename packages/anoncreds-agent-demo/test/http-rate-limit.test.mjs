import test from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter, configuredRateLimit } from "../src/roles/http.mjs";

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    status: null,
    body: null,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    writeHead(status) { this.status = status; },
    end(body) { this.body = JSON.parse(body); },
  };
}

test("rate limiter isolates remote IPs and returns 429 with Retry-After", () => {
  let timestamp = 10_000;
  const allow = createRateLimiter({ limit: 2, windowMs: 5_000, now: () => timestamp });
  const request = address => ({ socket: { remoteAddress: address } });
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
  assert.equal(allow({ socket: { remoteAddress: "::ffff:192.0.2.8" } }, responseRecorder()), true);
  const blocked = responseRecorder();
  assert.equal(allow({ socket: { remoteAddress: "192.0.2.8" } }, blocked), false);
  assert.equal(blocked.status, 429);
});

test("rate limiter rejects invalid configuration and bounds its key map", () => {
  assert.throws(() => createRateLimiter({ limit: 0 }), /positive integer/);
  assert.throws(() => createRateLimiter({ windowMs: 0 }), /positive integer/);
  const allow = createRateLimiter({ limit: 1, maxEntries: 1 });
  assert.equal(allow({ socket: { remoteAddress: "192.0.2.1" } }, responseRecorder()), true);
  const blocked = responseRecorder();
  assert.equal(allow({ socket: { remoteAddress: "192.0.2.2" } }, blocked), false);
  assert.equal(blocked.status, 503);
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
