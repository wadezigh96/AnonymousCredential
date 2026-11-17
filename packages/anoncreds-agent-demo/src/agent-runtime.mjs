import {createPrivateKey,createPublicKey,sign as ed25519Sign,verify as ed25519Verify} from "node:crypto";
import {CapabilityVerificationError,capabilityDigest,verifyCapabilityChain} from "./capability.mjs";
import {MemoryAuthorizationStore} from "./authorization-store.mjs";
const REQUEST_DOMAIN=Buffer.from("ANONYMESH_AGENT_REQUEST_V1\0","utf8"),KEY_BYTES=32,SIGNATURE_BYTES=64;
function fail(code){throw new CapabilityVerificationError(code);}
function decode(value,length,code){if(typeof value!=="string"||!/^[A-Za-z0-9_-]+$/.test(value))fail(code);const b=Buffer.from(value,"base64url");if(b.length!==length||b.toString("base64url")!==value)fail(code);return b;}
function keyObject(input){if(input&&typeof input==="object"&&input.type==="private"){if(input.asymmetricKeyType!=="ed25519")fail("INVALID_PRIVATE_KEY_TYPE");return input;}let k;try{k=createPrivateKey(input);}catch{fail("INVALID_PRIVATE_KEY");}if(k.type!=="private"||k.asymmetricKeyType!=="ed25519")fail("INVALID_PRIVATE_KEY_TYPE");return k;}
function publicKeyFromRaw(raw){return createPublicKey({key:Buffer.concat([Buffer.from("302a300506032b6570032100","hex"),decode(raw,KEY_BYTES,"INVALID_DELEGATE_KEY")]),format:"der",type:"spki"});}
function transcript({nonce,capabilityDigest:digest,audience,action,resource,delegateKey}){for(const [field,value] of Object.entries({nonce,digest,audience,action,resource,delegateKey})){if(typeof value!=="string"||!value||Buffer.byteLength(value)>1024)fail("INVALID_REQUEST_"+field.toUpperCase());}decode(delegateKey,KEY_BYTES,"INVALID_DELEGATE_KEY");return Buffer.concat([REQUEST_DOMAIN,Buffer.from(JSON.stringify([nonce,digest,audience,action,resource,delegateKey]),"utf8")]);}
export function createAgentRequestProof({challenge,capabilityChain,privateKey}){
  if(!Array.isArray(capabilityChain)||!capabilityChain.length)fail("EMPTY_CHAIN");const leaf=capabilityChain.at(-1),digest=capabilityDigest(leaf),key=keyObject(privateKey);
  if(createPublicKey(key).export({format:"jwk"}).x!==leaf.delegateKey)fail("SIGNER_DOES_NOT_MATCH_DELEGATE");
  if(challenge?.capabilityDigest!==digest)fail("CHALLENGE_CAPABILITY_MISMATCH");
  if(challenge?.task!==leaf.action||challenge?.audience!==leaf.audience)fail("CHALLENGE_SCOPE_MISMATCH");
  const fields={nonce:challenge.nonce,capabilityDigest:digest,audience:challenge.audience,action:leaf.action,resource:leaf.resource,delegateKey:leaf.delegateKey};
  return Object.freeze({...fields,signature:ed25519Sign(null,transcript(fields),key).toString("base64url")});
}
export class AgentAuthorizationRuntime{
  #store;constructor({store}={}){this.#store=store??new MemoryAuthorizationStore();}
  authorizeAndConsume({chain,trustedRootIssuer,challenge,proof,expected,now=Math.floor(Date.now()/1000),withinTransaction=false}){
    if(!challenge||typeof challenge.nonce!=="string")fail("INVALID_CHALLENGE");
    const result=verifyCapabilityChain({chain,trustedRootIssuer,expected:{...expected,audience:challenge.audience,action:challenge.task},now});
    const leaf=chain[chain.length-1],digest=capabilityDigest(leaf);
    if(challenge.capabilityDigest!==digest)fail("CHALLENGE_CAPABILITY_MISMATCH");
    if(!proof||proof.nonce!==challenge.nonce)fail("REQUEST_NONCE_MISMATCH");
    if(proof.capabilityDigest!==digest)fail("REQUEST_CAPABILITY_MISMATCH");
    if(proof.audience!==challenge.audience)fail("REQUEST_AUDIENCE_MISMATCH");
    if(proof.action!==challenge.task||proof.action!==result.action)fail("REQUEST_ACTION_MISMATCH");
    if(proof.resource!==result.resource)fail("REQUEST_RESOURCE_MISMATCH");
    if(proof.delegateKey!==result.delegateKey)fail("REQUEST_DELEGATE_MISMATCH");
    const sig=decode(proof.signature,SIGNATURE_BYTES,"INVALID_REQUEST_SIGNATURE");
    if(!ed25519Verify(null,transcript(proof),publicKeyFromRaw(result.delegateKey),sig))fail("INVALID_REQUEST_SIGNATURE");
    let consumed;
    if(withinTransaction){if(typeof this.#store.consumeWithinTransaction!=="function")fail("ATOMIC_STORE_REQUIRED");consumed=this.#store.consumeWithinTransaction({nonce:challenge.nonce,digest,quota:result.remainingQuota});}
    else consumed=this.#store.consume({nonce:challenge.nonce,digest,quota:result.remainingQuota});
    return Object.freeze({authorized:true,capabilityDigest:digest,action:result.action,resource:result.resource,remainingQuota:consumed.remainingQuota});
  }
  async authorizeAndExecute(args,execute){if(typeof execute!=="function")throw new TypeError("An authorized action callback is required");const authorization=this.authorizeAndConsume(args);const result=await execute(Object.freeze({action:authorization.action,resource:authorization.resource,capabilityDigest:authorization.capabilityDigest}));return Object.freeze({authorization,result});}
}
