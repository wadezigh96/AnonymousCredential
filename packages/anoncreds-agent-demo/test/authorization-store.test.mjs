import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteAuthorizationStore } from "../src/authorization-store.mjs";

test("SQLite replay and quota state survive closing and reopening the verifier store", t => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-auth-store-"));
  const filename = join(directory, "authorization.sqlite");
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const first = new SqliteAuthorizationStore({ filename });
  assert.deepEqual(first.consume({ nonce: "challenge-1", digest: "capability-1", quota: 2 }), {
    remainingQuota: 1,
  });
  first.close();

  const restarted = new SqliteAuthorizationStore({ filename });
  t.after(() => restarted.close());

  assert.throws(
    () => restarted.consume({ nonce: "challenge-1", digest: "capability-1", quota: 2 }),
    error => error.code === "CHALLENGE_REPLAY",
  );
  assert.deepEqual(restarted.consume({ nonce: "challenge-2", digest: "capability-1", quota: 2 }), {
    remainingQuota: 0,
  });
  assert.throws(
    () => restarted.consume({ nonce: "challenge-3", digest: "capability-1", quota: 2 }),
    error => error.code === "CAPABILITY_QUOTA_EXHAUSTED",
  );
});

test("SQLite store rolls back nonce insertion when capability quota is exhausted", t => {
  const directory = mkdtempSync(join(tmpdir(), "anonymesh-auth-store-"));
  const filename = join(directory, "authorization.sqlite");
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new SqliteAuthorizationStore({ filename });
  t.after(() => store.close());

  store.consume({ nonce: "used-once", digest: "single-use-capability", quota: 1 });
  assert.throws(
    () => store.consume({ nonce: "rejected-at-quota", digest: "single-use-capability", quota: 1 }),
    error => error.code === "CAPABILITY_QUOTA_EXHAUSTED",
  );

  // The rejected nonce was not committed and can be used with a different
  // capability after the transaction rolled back.
  assert.deepEqual(store.consume({
    nonce: "rejected-at-quota",
    digest: "another-capability",
    quota: 1,
  }), { remainingQuota: 0 });
});
