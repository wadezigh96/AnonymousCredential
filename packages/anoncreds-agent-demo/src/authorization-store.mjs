import { DatabaseSync } from "node:sqlite";
import { CapabilityVerificationError } from "./capability.mjs";

function fail(code) { throw new CapabilityVerificationError(code); }
function validate({ nonce, digest, quota }) {
  if (typeof nonce !== "string" || nonce.length === 0 || Buffer.byteLength(nonce) > 1024) fail("INVALID_NONCE");
  if (typeof digest !== "string" || digest.length === 0 || Buffer.byteLength(digest) > 256) fail("INVALID_CAPABILITY_DIGEST");
  if (!Number.isSafeInteger(quota) || quota < 1) fail("INVALID_QUOTA");
}

export class MemoryAuthorizationStore {
  #nonces = new Set();
  #usage = new Map();
  consume({ nonce, digest, quota }) {
    validate({ nonce, digest, quota });
    if (this.#nonces.has(nonce)) fail("CHALLENGE_REPLAY");
    const used = this.#usage.get(digest) ?? 0;
    if (used >= quota) fail("CAPABILITY_QUOTA_EXHAUSTED");
    this.#nonces.add(nonce);
    this.#usage.set(digest, used + 1);
    return Object.freeze({ remainingQuota: quota - used - 1 });
  }
}

/** SQLite transactionally persists replay and quota consumption across restarts. */
export class SqliteAuthorizationStore {
  #db;
  constructor({ filename }) {
    if (typeof filename !== "string" || filename.length === 0) throw new TypeError("A SQLite database filename is required");
    this.#db = new DatabaseSync(filename);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS consumed_nonces (
        nonce TEXT PRIMARY KEY, capability_digest TEXT NOT NULL, consumed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS capability_usage (
        capability_digest TEXT PRIMARY KEY, used INTEGER NOT NULL CHECK (used >= 0)
      );
    `);
  }
  consume({ nonce, digest, quota }) {
    validate({ nonce, digest, quota });
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      if (this.#db.prepare("SELECT 1 AS found FROM consumed_nonces WHERE nonce = ?").get(nonce)) fail("CHALLENGE_REPLAY");
      const row = this.#db.prepare("SELECT used FROM capability_usage WHERE capability_digest = ?").get(digest);
      const used = row?.used ?? 0;
      if (used >= quota) fail("CAPABILITY_QUOTA_EXHAUSTED");
      this.#db.prepare("INSERT INTO consumed_nonces (nonce, capability_digest, consumed_at) VALUES (?, ?, ?)").run(nonce, digest, Math.floor(Date.now() / 1000));
      this.#db.prepare(`
        INSERT INTO capability_usage (capability_digest, used) VALUES (?, 1)
        ON CONFLICT(capability_digest) DO UPDATE SET used = used + 1
      `).run(digest);
      this.#db.exec("COMMIT");
      return Object.freeze({ remainingQuota: quota - used - 1 });
    } catch (error) {
      try { this.#db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }
  close() { this.#db.close(); }
}
