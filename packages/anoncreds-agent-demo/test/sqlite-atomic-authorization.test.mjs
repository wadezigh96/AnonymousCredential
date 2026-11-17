import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {SqliteAuthorizationStore} from "../src/authorization-store.mjs";
import {SqliteChallengeLedger} from "../src/sqlite-challenge-ledger.mjs";
test("injected mid-transaction failure rolls back challenge, nonce and quota together",t=>{
 const directory=mkdtempSync(join(tmpdir(),"anonymesh-atomic-state-")),database=new DatabaseSync(join(directory,"state.sqlite"));
 const store=new SqliteAuthorizationStore({database}),ledger=new SqliteChallengeLedger({database});
 t.after(()=>{ledger.close();store.close();database.close();rmSync(directory,{recursive:true,force:true});});
 const challenge=ledger.issue({audience:"agent-b",task:"read:weather",capabilityDigest:"capability-atomic",resource:"weather:global",now:1000,ttlSeconds:60});
 ledger.attachPresentationRequest(challenge.nonce,{nonce:challenge.nonce});
 const failed=ledger.verifyAndConsume({nonce:challenge.nonce,audience:challenge.audience,task:challenge.task,capabilityDigest:challenge.capabilityDigest,now:1001,
  verify:()=>{store.consumeWithinTransaction({nonce:challenge.nonce,digest:"capability-atomic",quota:1});throw new Error("INJECTED_FAILURE_AFTER_NONCE_AND_QUOTA_WRITES");}});
 assert.equal(failed,false);assert.equal(ledger.get(challenge.nonce).consumed,false);
 assert.deepEqual(store.consume({nonce:challenge.nonce,digest:"capability-atomic",quota:1}),{remainingQuota:0});
 assert.throws(()=>store.consume({nonce:"next-nonce",digest:"capability-atomic",quota:1}),e=>e.code==="CAPABILITY_QUOTA_EXHAUSTED");
 assert.equal(ledger.get(challenge.nonce).consumed,false);
});
