import test from "node:test";
import assert from "node:assert/strict";
import { readJson, routeError, configureHttpServer } from "../src/roles/http.mjs";
function requestFrom(chunks, headers = { "content-type": "application/json" }) {
  return { headers, async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield Buffer.from(chunk); } };
}
function responseRecorder() {
  return { status:null, headers:{}, body:null, writableEnded:false, destroyed:false,
    headersSent:false, destroyCalls:0,
    writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
    end(body){this.body=JSON.parse(body);this.writableEnded=true;},
    destroy(){this.destroyed=true;this.destroyCalls+=1;} };
}
test("readJson accepts bounded JSON and empty body",async()=>{
 assert.deepEqual(await readJson(requestFrom(['{"ok":true}'])),{ok:true});
 assert.deepEqual(await readJson(requestFrom([])),{});
});
test("oversized body returns safe 413",async()=>{
 let error;try{await readJson(requestFrom(["12345"]),4);}catch(e){error=e;}
 assert.equal(error?.statusCode,413);const response=responseRecorder();routeError(response,error);
 assert.equal(response.status,413);assert.deepEqual(response.body,{error:"Request body too large"});
});
test("default JSON parser accepts exactly 1 MiB and rejects one byte over",async()=>{
 const maxBytes=1024*1024;
 const exact='{"x":"'+"a".repeat(maxBytes-8)+'"}';
 assert.equal(Buffer.byteLength(exact),maxBytes);
 assert.equal((await readJson(requestFrom([exact]))).x.length,maxBytes-8);
 const over='{"x":"'+"a".repeat(maxBytes-7)+'"}';
 let error;try{await readJson(requestFrom([over]));}catch(caught){error=caught;}
 assert.equal(error?.statusCode,413);
});
test("malformed JSON returns safe 400",async()=>{
 let error;try{await readJson(requestFrom(["{broken"]));}catch(e){error=e;}
 const response=responseRecorder();routeError(response,error);assert.equal(response.status,400);
 assert.deepEqual(response.body,{error:"Invalid JSON request body"});
});
test("non-JSON content type returns 415",async()=>{
 let error;try{await readJson(requestFrom(["{}"],{"content-type":"text/plain"}));}catch(e){error=e;}
 const response=responseRecorder();routeError(response,error);assert.equal(response.status,415);
 assert.deepEqual(response.body,{error:"Content-Type must be application/json"});
});
test("internal errors are sanitized and response is not written twice",()=>{
 const response=responseRecorder();routeError(response,new Error("SQLITE_SECRET_PATH /private/secret"));
 assert.equal(response.status,500);assert.deepEqual(response.body,{error:"Internal server error"});
 routeError(response,new Error("second"));assert.equal(response.body.error,"Internal server error");
});
test("routeError leaves destroyed and ended responses untouched",()=>{
 for(const state of [{destroyed:true},{writableEnded:true}]){
  const response=responseRecorder();Object.assign(response,state);
  assert.equal(routeError(response,new Error("private")),false);
  assert.equal(response.status,null);assert.equal(response.destroyCalls,0);
 }
});
test("routeError destroys a response after headers are sent without a second status",()=>{
 const response=responseRecorder();response.headersSent=true;
 assert.equal(routeError(response,new Error("private")),false);
 assert.equal(response.status,null);assert.equal(response.body,null);
 assert.equal(response.destroyed,true);assert.equal(response.destroyCalls,1);
});
test("sendJson refuses to write after headers are sent",async()=>{
 const {sendJson}=await import("../src/roles/http.mjs");
 const response=responseRecorder();response.headersSent=true;
 assert.equal(sendJson(response,200,{safe:true}),false);
 assert.equal(response.status,null);assert.equal(response.destroyed,true);
});
test("HTTP server timeout limits are explicit",()=>{
 const server={headersTimeout:0,requestTimeout:0,keepAliveTimeout:0,maxRequestsPerSocket:0,connectionsCheckingInterval:0};
 configureHttpServer(server);assert.equal(server.headersTimeout,10000);assert.equal(server.requestTimeout,15000);
 assert.equal(server.keepAliveTimeout,5000);assert.equal(server.maxRequestsPerSocket,100);
 assert.equal(server.connectionsCheckingInterval,1000);
});
