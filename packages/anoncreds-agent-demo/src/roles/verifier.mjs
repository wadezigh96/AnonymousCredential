import {createServer} from "node:http";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {homedir} from "node:os";
import {dirname,join} from "node:path";
import {makePresentationRequest} from "../index.mjs";
import {AgentAuthorizationRuntime} from "../agent-runtime.mjs";
import {SqliteAuthorizationStore} from "../authorization-store.mjs";
import {SqliteChallengeLedger} from "../sqlite-challenge-ledger.mjs";
import {capabilityDigest} from "../capability.mjs";
import {verifyAndAuthorizeAgentRequest} from "../paai-verifier.mjs";
import {configuredRateLimit,createRateLimiter,readJson,requireApiToken,requireBearerToken,routeError,sendJson} from "./http.mjs";
const issuerUrl=process.env.ISSUER_URL??"http://127.0.0.1:4311",port=Number(process.env.PORT??4313),host=process.env.HOST??"127.0.0.1";
const defaultStateDb=join(homedir(),".local","state","anonymesh","authorization.sqlite");
const stateDb=process.env.STATE_DB??process.env.AUTHORIZATION_DB??defaultStateDb;
const verifierToken=requireApiToken("VERIFIER_API_TOKEN");
const rateLimitWindow=configuredRateLimit("RATE_LIMIT_WINDOW_MS",60_000);
const challengeRateLimit=createRateLimiter({limit:configuredRateLimit("VERIFIER_CHALLENGE_RATE_LIMIT"),windowMs:rateLimitWindow});
const verifyRateLimit=createRateLimiter({limit:configuredRateLimit("VERIFIER_VERIFY_RATE_LIMIT"),windowMs:rateLimitWindow});
mkdirSync(dirname(stateDb),{recursive:true});
const database=new DatabaseSync(stateDb);
const authorizationStore=new SqliteAuthorizationStore({database});
const ledger=new SqliteChallengeLedger({database});
const runtime=new AgentAuthorizationRuntime({store:authorizationStore});
const publicResponse=await fetch(issuerUrl+"/public");if(!publicResponse.ok)throw new Error("Issuer public configuration unavailable");
const publicConfig=await publicResponse.json();
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,"http://localhost");
  if(request.method==="GET"&&url.pathname==="/health")return sendJson(response,200,{role:"verifier",ready:true});
  if(request.method==="POST"&&url.pathname==="/challenge"){
   if(!requireBearerToken(request,response,verifierToken))return;
   if(!challengeRateLimit(request,response))return;
   const body=await readJson(request);
   if(body.audience!==publicConfig.demoPolicy.audience||body.task!==publicConfig.demoPolicy.action||body.resource!==publicConfig.demoPolicy.resource)return sendJson(response,403,{error:"Requested scope is outside demo verifier policy"});
   if(!Array.isArray(body.capabilityChain)||!body.capabilityChain.length)return sendJson(response,400,{error:"A capability chain is required"});
   const digest=capabilityDigest(body.capabilityChain.at(-1));
   const challenge=ledger.issue({audience:body.audience,task:body.task,capabilityDigest:digest,resource:body.resource,ttlSeconds:body.ttlSeconds??60});
   const presentationRequest=makePresentationRequest(challenge).toJson();ledger.attachPresentationRequest(challenge.nonce,presentationRequest);
   return sendJson(response,200,{...challenge,presentationRequest});
  }
  if(request.method==="POST"&&url.pathname==="/verify"){
   if(!requireBearerToken(request,response,verifierToken))return;
   if(!verifyRateLimit(request,response))return;
   const body=await readJson(request);
   if(typeof body.nonce!=="string"||!body.presentation||!Array.isArray(body.capabilityChain)||!body.requestProof)return sendJson(response,400,{authorized:false,code:"INVALID_VERIFICATION_INPUT"});
   const challenge=ledger.get(body.nonce);if(!challenge)return sendJson(response,401,{authorized:false,code:"UNKNOWN_CHALLENGE"});
   const result=verifyAndAuthorizeAgentRequest({nonce:body.nonce,presentationJson:body.presentation,capabilityChain:body.capabilityChain,requestProof:body.requestProof,
    trustedRootIssuer:publicConfig.trustedRootIssuer,expected:{audience:challenge.audience,action:challenge.task,resource:challenge.resource},
    challengeLedger:ledger,verifierSchema:publicConfig.schema,verifierCredentialDefinition:publicConfig.credentialDefinition,runtime});
   return sendJson(response,result.authorized?200:401,result);
  }
  return sendJson(response,404,{error:"Not found"});
 }catch(error){return routeError(response,error);}
});
server.listen(port,host,()=>process.stdout.write(JSON.stringify({role:"verifier",host,port})+"\n"));
function shutdown(){server.close(()=>{ledger.close();authorizationStore.close();database.close();process.exit(0);});}
process.once("SIGTERM",shutdown);process.once("SIGINT",shutdown);
