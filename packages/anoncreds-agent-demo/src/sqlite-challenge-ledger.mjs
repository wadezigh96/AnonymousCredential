import { DatabaseSync } from "node:sqlite";
import { Nonce } from "@hyperledger/anoncreds-nodejs";
const MAX_PENDING_CHALLENGES=10_000;
export class SqliteChallengeLedger {
  #db; #ownsDb;
  constructor({ filename, database } = {}) {
    if (!database && (typeof filename!=="string" || !filename)) throw new TypeError("A SQLite filename or shared database connection is required");
    this.#ownsDb=!database; this.#db=database ?? new DatabaseSync(filename);
    this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS challenges (
        nonce TEXT PRIMARY KEY,audience TEXT NOT NULL,task TEXT NOT NULL,capability_digest TEXT NOT NULL,
        resource TEXT NOT NULL,issued_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,
        consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1)),presentation_request TEXT);
      CREATE INDEX IF NOT EXISTS challenges_expiry_idx ON challenges(expires_at);`);
  }
  get atomicAuthorization(){return true;}
  issue({audience,task,capabilityDigest,resource,now=Math.floor(Date.now()/1000),ttlSeconds=60}){
    if(!audience||!task||!capabilityDigest||typeof resource!=="string"||!resource||!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>300) throw new Error("Invalid challenge parameters");
    const c={nonce:Nonce.generate(),audience,task,capabilityDigest,resource,issuedAt:now,expiresAt:now+ttlSeconds};
    this.#db.exec("BEGIN IMMEDIATE");
    try{
      this.#db.prepare("DELETE FROM challenges WHERE expires_at<=?").run(now);
      if(this.#db.prepare("SELECT COUNT(*) AS count FROM challenges WHERE consumed=0").get().count>=MAX_PENDING_CHALLENGES) throw new Error("Challenge capacity reached");
      this.#db.prepare(`INSERT INTO challenges(nonce,audience,task,capability_digest,resource,issued_at,expires_at) VALUES(?,?,?,?,?,?,?)`).run(c.nonce,audience,task,capabilityDigest,resource,c.issuedAt,c.expiresAt);
      this.#db.exec("COMMIT"); return Object.freeze(c);
    }catch(e){try{this.#db.exec("ROLLBACK");}catch{}throw e;}
  }
  attachPresentationRequest(nonce,request){
    const r=this.#db.prepare("SELECT consumed,presentation_request FROM challenges WHERE nonce=?").get(nonce);
    if(!r||r.consumed||r.presentation_request) throw new Error("Challenge missing, consumed, or already initialized");
    if(request?.nonce!==nonce) throw new Error("Presentation request nonce mismatch");
    const changed=this.#db.prepare("UPDATE challenges SET presentation_request=? WHERE nonce=? AND consumed=0 AND presentation_request IS NULL").run(JSON.stringify(request),nonce);
    if(changed.changes!==1) throw new Error("Challenge request initialization raced");
  }
  get(nonce){
    const r=this.#db.prepare("SELECT * FROM challenges WHERE nonce=?").get(nonce); if(!r)return null;
    return {nonce:r.nonce,audience:r.audience,task:r.task,capabilityDigest:r.capability_digest,resource:r.resource,
      issuedAt:r.issued_at,expiresAt:r.expires_at,consumed:r.consumed===1,
      presentationRequest:r.presentation_request?JSON.parse(r.presentation_request):null};
  }
  #assertPending({nonce,audience,task,capabilityDigest,now}){
    const r=this.get(nonce); if(!r||r.consumed)throw new Error("Unknown or already consumed challenge");
    if(r.expiresAt<=now)throw new Error("Challenge expired");
    if(r.audience!==audience||r.task!==task||r.capabilityDigest!==capabilityDigest)throw new Error("Challenge context mismatch");
    if(!r.presentationRequest)throw new Error("Challenge request is not initialized"); return r;
  }
  consume(context){
    const r=this.#assertPending({...context,now:context.now??Math.floor(Date.now()/1000)});
    const changed=this.#db.prepare("UPDATE challenges SET consumed=1 WHERE nonce=? AND consumed=0").run(r.nonce);
    if(changed.changes!==1)throw new Error("Unknown or already consumed challenge"); return true;
  }
  verifyAndConsume(context){
    const {verify}=context; if(typeof verify!=="function")throw new Error("A proof verification callback is required");
    const now=context.now??Math.floor(Date.now()/1000), pending=this.#assertPending({...context,now});
    this.#db.exec("BEGIN IMMEDIATE");
    try{
      this.#assertPending({...context,now});
      const valid=verify(structuredClone(pending.presentationRequest),{atomic:true})===true;
      if(!valid){this.#db.exec("ROLLBACK");return false;}
      const current=this.#assertPending({...context,now});
      const changed=this.#db.prepare("UPDATE challenges SET consumed=1 WHERE nonce=? AND consumed=0").run(current.nonce);
      if(changed.changes!==1)throw new Error("Challenge consumption raced");
      this.#db.exec("COMMIT");return true;
    }catch{try{this.#db.exec("ROLLBACK");}catch{}return false;}
  }
  close(){if(this.#ownsDb)this.#db.close();}
}
