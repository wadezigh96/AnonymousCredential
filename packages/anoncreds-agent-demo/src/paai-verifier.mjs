import {AnoncredsError,Presentation,PresentationRequest} from "@hyperledger/anoncreds-nodejs";
import {extractCredentialAgentPublicKey,extractCredentialIssuerRegistryKey} from "./agent-key-binding.mjs";
import {AgentAuthorizationRuntime} from "./agent-runtime.mjs";
import {CRED_DEF_ID,SCHEMA_ID} from "./index.mjs";
const REQUIRED_SCHEMA_ATTRIBUTES=["agent_role","agent_subject","valid_until","capability_scope","agent_public_key","issuer_registry_key"];
function isRecord(v){return v!==null&&typeof v==="object"&&!Array.isArray(v);}
function serializedConfig(v){if(!isRecord(v))return null;if(typeof v.toJson!=="function")return v;try{return v.toJson();}catch{return null;}}
function verifierConfigurationError(schema,definition){
  schema=serializedConfig(schema);definition=serializedConfig(definition);if(!isRecord(schema)||!isRecord(definition))return true;
  if(schema.name!=="anonymesh-agent-authorization"||schema.version!=="1.0"||schema.issuerId!=="did:example:anonymesh:issuer"||
    !Array.isArray(schema.attrNames)||schema.attrNames.length!==REQUIRED_SCHEMA_ATTRIBUTES.length||
    schema.attrNames.some((n,i)=>n!==REQUIRED_SCHEMA_ATTRIBUTES[i]))return true;
  return definition.schemaId!==SCHEMA_ID||definition.type!=="CL"||definition.tag!=="v1"||!isRecord(definition.value)||!isRecord(definition.value.primary);
}
export function classifyVerificationError(error){
  if(error instanceof AnoncredsError&&error.code===7&&typeof error.message==="string"&&error.message.startsWith("Proof rejected:"))return "ANONCREDS_PROOF_INVALID";
  return error instanceof AnoncredsError?"ANONCREDS_NATIVE_ERROR":"ANONCREDS_INTERNAL_ERROR";
}
export function verifyAndAuthorizeAgentRequest({nonce,presentationJson,capabilityChain,requestProof,trustedRootIssuer,expected,challengeLedger,verifierSchema,verifierCredentialDefinition,issuerRecord,registryRequired=false,runtime=new AgentAuthorizationRuntime(),now=Math.floor(Date.now()/1000)}){
  if(typeof nonce!=="string"||!nonce||!challengeLedger||!presentationJson)return Object.freeze({authorized:false,code:"INVALID_VERIFICATION_INPUT"});
  if(verifierConfigurationError(verifierSchema,verifierCredentialDefinition))return Object.freeze({authorized:false,code:"INVALID_VERIFIER_CONFIGURATION"});
  if(registryRequired&&(!issuerRecord||issuerRecord.active!==true||typeof issuerRecord.nodePublicKey!=="string"))return Object.freeze({authorized:false,code:"REGISTRY_UNAVAILABLE"});
  const challenge=challengeLedger.get(nonce);if(!challenge)return Object.freeze({authorized:false,code:"UNKNOWN_CHALLENGE"});
  if(challenge.consumed||challenge.expiresAt<=now)return Object.freeze({authorized:false,code:"CHALLENGE_EXPIRED_OR_CONSUMED"});
  let authorization=null,failureCode=null;
  const valid=challengeLedger.verifyAndConsume({nonce:challenge.nonce,audience:challenge.audience,task:challenge.task,capabilityDigest:challenge.capabilityDigest,now,
    verify:trustedRequestJson=>{
      let presentation;try{presentation=Presentation.fromJson(presentationJson);}catch{failureCode="ANONCREDS_PROOF_INVALID";return false;}
      let anonCredsValid=false;
      try{anonCredsValid=presentation.verify({presentationRequest:PresentationRequest.fromJson(trustedRequestJson),schemas:{[SCHEMA_ID]:verifierSchema},credentialDefinitions:{[CRED_DEF_ID]:verifierCredentialDefinition}});}
      catch(error){failureCode=classifyVerificationError(error);return false;}
      if(!anonCredsValid){failureCode="ANONCREDS_PROOF_INVALID";return false;}
      let credentialKey;try{credentialKey=extractCredentialAgentPublicKey(presentationJson);}catch(error){failureCode=error.code??"CREDENTIAL_KEY_INVALID";return false;}
      if(registryRequired){
        let registryKey;try{registryKey=extractCredentialIssuerRegistryKey(presentationJson);}catch(error){failureCode=error.code??"ISSUER_KEY_INVALID";return false;}
        if(registryKey!==issuerRecord.nodePublicKey){failureCode="ISSUER_REGISTRY_KEY_MISMATCH";return false;}
        if(expected?.issuerKeyVersion!==undefined&&issuerRecord.keyVersion!==expected.issuerKeyVersion){failureCode="ISSUER_KEY_VERSION_MISMATCH";return false;}
        if(expected?.schemaHash!==undefined&&issuerRecord.schemaHash!==expected.schemaHash){failureCode="ISSUER_SCHEMA_MISMATCH";return false;}
      }
      if(!Array.isArray(capabilityChain)||!capabilityChain.length||capabilityChain[0]?.delegateKey!==credentialKey){failureCode="CREDENTIAL_CAPABILITY_KEY_MISMATCH";return false;}
      try{
        authorization=runtime.authorizeAndConsume({chain:capabilityChain,trustedRootIssuer,challenge,proof:requestProof,
          expected:{...expected,delegateKey:capabilityChain.at(-1)?.delegateKey},now,
          withinTransaction:challengeLedger.atomicAuthorization===true});
        return true;
      }catch(error){failureCode=error.code??"CAPABILITY_AUTHORIZATION_FAILED";return false;}
    }});
  if(!valid)return Object.freeze({authorized:false,code:failureCode??"CHALLENGE_VERIFICATION_FAILED"});
  return Object.freeze({...authorization,authorized:true});
}
