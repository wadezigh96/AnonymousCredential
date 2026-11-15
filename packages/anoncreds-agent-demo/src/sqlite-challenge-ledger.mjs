import { DatabaseSync } from "node:sqlite";
import { Nonce } from "@hyperledger/anoncreds-nodejs";

/**
 * Durable challenge ledger for a single verifier process.
 * SQLite persists challenge scope, trusted presentation request and consumed
 * state across restarts. Authorization-store nonce/quota writes remain the
 * cross-process atomic replay barrier.
 */
export class SqliteChallengeLedger {
  #db;

  constructor({ filename }) {
    if (typeof filename !== "string" || filename.length === 0) {
      throw new TypeError("A SQLite database filename is required");
    }
    this.#db = new DatabaseSync(filename);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS challenges (
        nonce TEXT PRIMARY KEY,
        audience TEXT NOT NULL,
        task TEXT NOT NULL,
        capability_digest TEXT NOT NULL,
        resource TEXT NOT NULL,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0, 1)),
        presentation_request TEXT
      );
    `);
  }

  issue({ audience, task, capabilityDigest, resource, now = Math.floor(Date.now() / 1000), ttlSeconds = 60 }) {
    if (!audience || !task || !capabilityDigest || typeof resource !== "string" || resource.length === 0 || !Number.isInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new Error("Invalid challenge parameters");
    }
    const nonce = Nonce.generate();
    const challenge = {
      nonce, audience, task, capabilityDigest, resource,
      issuedAt: now, expiresAt: now + ttlSeconds,
    };
    this.#db.prepare(`
      INSERT INTO challenges (nonce, audience, task, capability_digest, resource, issued_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(nonce, audience, task, capabilityDigest, resource, challenge.issuedAt, challenge.expiresAt);
    return Object.freeze(challenge);
  }

  attachPresentationRequest(nonce, presentationRequest) {
    const record = this.#db.prepare(
      "SELECT consumed, presentation_request FROM challenges WHERE nonce = ?"
    ).get(nonce);
    if (!record || record.consumed || record.presentation_request) {
      throw new Error("Challenge missing, consumed, or already initialized");
    }
    if (presentationRequest?.nonce !== nonce) {
      throw new Error("Presentation request nonce mismatch");
    }
    this.#db.prepare(
      "UPDATE challenges SET presentation_request = ? WHERE nonce = ? AND consumed = 0 AND presentation_request IS NULL"
    ).run(JSON.stringify(presentationRequest), nonce);
  }

  get(nonce) {
    const row = this.#db.prepare("SELECT * FROM challenges WHERE nonce = ?").get(nonce);
    if (!row) return null;
    return {
      nonce: row.nonce,
      audience: row.audience,
      task: row.task,
      capabilityDigest: row.capability_digest,
      resource: row.resource,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      consumed: row.consumed === 1,
      presentationRequest: row.presentation_request ? JSON.parse(row.presentation_request) : null,
    };
  }

  #assertPending({ nonce, audience, task, capabilityDigest, now }) {
    const record = this.get(nonce);
    if (!record || record.consumed) throw new Error("Unknown or already consumed challenge");
    if (record.expiresAt <= now) throw new Error("Challenge expired");
    if (record.audience !== audience || record.task !== task ||
        record.capabilityDigest !== capabilityDigest) {
      throw new Error("Challenge context mismatch");
    }
    if (!record.presentationRequest) throw new Error("Challenge request is not initialized");
    return record;
  }

  consume(context) {
    const record = this.#assertPending({
      ...context,
      now: context.now ?? Math.floor(Date.now() / 1000),
    });
    const result = this.#db.prepare(
      "UPDATE challenges SET consumed = 1 WHERE nonce = ? AND consumed = 0"
    ).run(record.nonce);
    if (result.changes !== 1) throw new Error("Unknown or already consumed challenge");
    return true;
  }

  verifyAndConsume(context) {
    const { verify } = context;
    if (typeof verify !== "function") throw new Error("A proof verification callback is required");
    const now = context.now ?? Math.floor(Date.now() / 1000);
    const pending = this.#assertPending({ ...context, now });
    let valid = false;
    try {
      valid = verify(structuredClone(pending.presentationRequest)) === true;
    } catch {
      return false;
    }
    if (!valid) return false;
    this.#assertPending({ ...context, now });
    const result = this.#db.prepare(
      "UPDATE challenges SET consumed = 1 WHERE nonce = ? AND consumed = 0"
    ).run(pending.nonce);
    return result.changes === 1;
  }

  close() { this.#db.close(); }
}
