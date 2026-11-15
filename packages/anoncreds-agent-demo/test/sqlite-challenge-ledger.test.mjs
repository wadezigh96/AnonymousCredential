import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteChallengeLedger } from "../src/sqlite-challenge-ledger.mjs";

test("challenge lifetime is bounded and expired records are pruned on issuance", t => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-challenge-ledger-"));
  const filename = join(directory, "challenges.sqlite");
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const ledger = new SqliteChallengeLedger({ filename });
  t.after(() => ledger.close());

  assert.throws(() => ledger.issue({
    audience: "agent-b",
    task: "weather:read",
    capabilityDigest: "digest",
    resource: "weather:local",
    now: 1000,
    ttlSeconds: 301,
  }), /Invalid challenge parameters/);

  const expired = ledger.issue({
    audience: "agent-b",
    task: "weather:read",
    capabilityDigest: "digest",
    resource: "weather:local",
    now: 1000,
    ttlSeconds: 10,
  });
  ledger.attachPresentationRequest(expired.nonce, { nonce: expired.nonce });
  assert.ok(ledger.get(expired.nonce));

  ledger.issue({
    audience: "agent-b",
    task: "weather:read",
    capabilityDigest: "digest",
    resource: "weather:local",
    now: 1010,
    ttlSeconds: 30,
  });
  assert.equal(ledger.get(expired.nonce), null);
});
