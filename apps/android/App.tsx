import React, { useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getRandomBytesAsync } from "expo-crypto";
import {
  Credential,
  CredentialDefinition,
  CredentialOffer,
  CredentialRequest,
  LinkSecret,
  Nonce,
  Presentation,
  PresentationRequest,
  Schema,
} from "@hyperledger/anoncreds-react-native";

const ISSUER_ID = "did:example:anonymesh:issuer";
const SCHEMA_ID = "anonymesh:agent-authorization:1";
const CRED_DEF_ID = "anonymesh:agent-authorization:1:CL";
const PRIVATE_SUBJECT_MARKER = "agent-a-private-subject-7f3a";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function runNativeProofDemo() {
  const now = Math.floor(Date.now() / 1000);
  // Demo-only issuer setup. Production issuer keys must remain in a protected issuer service.
  const schema = Schema.create({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    issuerId: ISSUER_ID,
    attributeNames: ["agent_role", "agent_subject", "valid_until", "capability_scope"],
  });
  const { credentialDefinition, credentialDefinitionPrivate, keyCorrectnessProof } =
    CredentialDefinition.create({
      schemaId: SCHEMA_ID, schema, tag: "v1", issuerId: ISSUER_ID,
      signatureType: "CL", supportRevocation: false,
    });
  const offer = CredentialOffer.create({
    schemaId: SCHEMA_ID, credentialDefinitionId: CRED_DEF_ID, keyCorrectnessProof,
  });

  // Agent A's link secret is created and retained in this app process.
  const linkSecret = LinkSecret.create();
  const request = CredentialRequest.create({
    entropy: toHex(await getRandomBytesAsync(32)),
    credentialDefinition, linkSecret,
    linkSecretId: "anonymesh-mobile-agent-a",
    credentialOffer: offer,
  });
  // Local smoke-test issuer. This private key is ephemeral and must never be shipped as a real issuer.
  const credential = Credential.create({
    credentialDefinition, credentialDefinitionPrivate, credentialOffer: offer,
    credentialRequest: request.credentialRequest,
    attributeRawValues: {
      agent_role: "weather_reader",
      agent_subject: PRIVATE_SUBJECT_MARKER,
      valid_until: String(now + 3600),
      capability_scope: "weather:read",
    },
  });
  credential.process({
    credentialRequestMetadata: request.credentialRequestMetadata,
    linkSecret, credentialDefinition,
  });

  const presentationRequest = PresentationRequest.fromJson({
    name: "anonymesh-agent-authorization",
    version: "1.0",
    nonce: Nonce.generate(),
    requested_attributes: { role_ref: { name: "agent_role" } },
    requested_predicates: {
      expiry_ref: { name: "valid_until", p_type: ">=", p_value: now },
    },
  });
  const presentation = Presentation.create({
    presentationRequest,
    credentials: [{ credential }],
    credentialsProve: [
      { entryIndex: 0, referent: "role_ref", isPredicate: false, reveal: true },
      { entryIndex: 0, referent: "expiry_ref", isPredicate: true, reveal: false },
    ],
    selfAttest: {},
    linkSecret,
    schemas: { [SCHEMA_ID]: schema.toJson() },
    credentialDefinitions: { [CRED_DEF_ID]: credentialDefinition.toJson() },
  });
  const proofJson = JSON.stringify(presentation.toJson());
  const valid = presentation.verify({
    presentationRequest,
    schemas: { [SCHEMA_ID]: schema.toJson() },
    credentialDefinitions: { [CRED_DEF_ID]: credentialDefinition.toJson() },
  });
  return {
    valid,
    privateSubjectDisclosed: proofJson.includes(PRIVATE_SUBJECT_MARKER),
    revealedRole: "weather_reader",
    proofJsonCharacters: proofJson.length,
  };
}

export default function App() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof runNativeProofDemo>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDemo() {
    setBusy(true); setResult(null); setError(null);
    try { setResult(await runNativeProofDemo()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Native AnonCreds demo failed"); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>PRIVATE AGENTIC IDENTITY</Text>
        <Text style={styles.title}>ANONYMESH</Text>
        <Text style={styles.subtitle}>Native AnonCreds proof check on Android</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Local proof demonstration</Text>
          <Text style={styles.body}>
            Creates a demo credential, retains Agent A's link secret in memory,
            reveals only its role, and proves a hidden expiry predicate.
          </Text>
          <Text style={styles.warning}>
            Single-process smoke test only. Issuer, holder and verifier are not
            separate security domains. Never use real identities or production keys.
          </Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={runDemo}
            style={[styles.button, busy && styles.buttonDisabled]}>
            {busy ? <ActivityIndicator color="#07111f" /> : <Text style={styles.buttonText}>Run native proof test</Text>}
          </TouchableOpacity>
        </View>
        {error ? <View style={styles.resultCard}>
          <Text style={styles.fail}>NATIVE TEST ERROR</Text><Text style={styles.body}>{error}</Text>
        </View> : null}
        {result ? <View style={styles.resultCard}>
          <Text style={result.valid && !result.privateSubjectDisclosed ? styles.pass : styles.fail}>
            {result.valid && !result.privateSubjectDisclosed ? "PROOF VERIFIED" : "PROOF CHECK FAILED"}
          </Text>
          <Text style={styles.metric}>Role disclosed: {result.revealedRole}</Text>
          <Text style={styles.metric}>Private subject disclosed: {String(result.privateSubjectDisclosed)}</Text>
          <Text style={styles.metric}>Proof JSON: {result.proofJsonCharacters} characters</Text>
        </View> : null}
        <Text style={styles.footer}>
          AnonCreds wrapper 0.5.0 · Physical Android runtime validation remains required.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07111f" },
  container: { flexGrow: 1, padding: 24, justifyContent: "center", gap: 18 },
  eyebrow: { color: "#75d7c4", fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  title: { color: "#f4f7fb", fontSize: 38, fontWeight: "800" },
  subtitle: { color: "#a8b6c8", fontSize: 16, marginBottom: 8 },
  card: { backgroundColor: "#111f31", borderColor: "#263b53", borderWidth: 1, borderRadius: 16, padding: 18, gap: 14 },
  cardTitle: { color: "#f4f7fb", fontSize: 19, fontWeight: "700" },
  body: { color: "#c2ccda", fontSize: 14, lineHeight: 21 },
  warning: { color: "#f2c879", fontSize: 13, lineHeight: 19 },
  button: { backgroundColor: "#75d7c4", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: "#07111f", fontSize: 15, fontWeight: "800" },
  resultCard: { backgroundColor: "#111f31", borderColor: "#263b53", borderWidth: 1, borderRadius: 16, padding: 18, gap: 10 },
  pass: { color: "#75d7c4", fontSize: 15, fontWeight: "800" },
  fail: { color: "#ff8e8e", fontSize: 15, fontWeight: "800" },
  metric: { color: "#e4ebf4", fontSize: 14 },
  footer: { color: "#8292a8", fontSize: 12, lineHeight: 18, marginTop: 4 },
});
