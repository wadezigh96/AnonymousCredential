import { performance } from "node:perf_hooks";
import {
  ChallengeLedger,
  createAgentPresentation,
  issueAgentCredential,
  makePresentationRequest,
} from "./index.mjs";

const iterations = Number(process.env.ANONYMESH_BENCH_ITERATIONS ?? 20);
if (!Number.isInteger(iterations) || iterations < 5 || iterations > 200) {
  throw new Error("ANONYMESH_BENCH_ITERATIONS must be an integer from 5 to 200");
}
const now = Math.floor(Date.now() / 1000);
const holder = issueAgentCredential({ validUntil: now + 86400 });
const ledger = new ChallengeLedger();
const context = { audience: "agent-b.anonymesh.benchmark", task: "read:weather", capabilityDigest: "sha256:benchmark-capability" };
const generationMs = [], verificationMs = [], proofSizes = [];
let peakRssBytes = process.memoryUsage().rss;
const cpuStart = process.cpuUsage();

for (let i = 0; i < iterations + 3; i += 1) {
  const timestamp = Math.floor(Date.now() / 1000);
  const challenge = ledger.issue({ ...context, now: timestamp, ttlSeconds: 120 });
  const request = makePresentationRequest(challenge, timestamp);
  const genStart = performance.now();
  const presentation = createAgentPresentation(holder, request);
  const genElapsed = performance.now() - genStart;
  const verifyStart = performance.now();
  const verified = presentation.verify({
    presentationRequest: request,
    schemas: { [holder.schemaId]: holder.schema },
    credentialDefinitions: { [holder.credentialDefinitionId]: holder.credentialDefinition },
  });
  const verifyElapsed = performance.now() - verifyStart;
  if (!verified) throw new Error("Benchmark produced an invalid proof");
  const proofBytes = Buffer.byteLength(JSON.stringify(presentation.toJson()));
  peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
  if (i >= 3) {
    generationMs.push(genElapsed);
    verificationMs.push(verifyElapsed);
    proofSizes.push(proofBytes);
  }
  presentation.handle.clear();
  request.handle.clear();
}
const cpu = process.cpuUsage(cpuStart);
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.ceil(p * sorted.length) - 1].toFixed(3));
};
const mean = values => Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
console.log(JSON.stringify({
  benchmark: "ANONYMESH AnonCreds CL proof generation and verification",
  runtime: process.version, platform: process.platform, architecture: process.arch, iterations,
  proofGenerationMs: { p50: percentile(generationMs, .50), p95: percentile(generationMs, .95), mean: mean(generationMs) },
  proofVerificationMs: { p50: percentile(verificationMs, .50), p95: percentile(verificationMs, .95), mean: mean(verificationMs) },
  proofSizeBytes: { p50: percentile(proofSizes, .50), p95: percentile(proofSizes, .95) },
  peakProcessRssMiB: Number((peakRssBytes / 1024 / 1024).toFixed(2)),
  cpuUserMs: Number((cpu.user / 1000).toFixed(2)), cpuSystemMs: Number((cpu.system / 1000).toFixed(2)),
  note: "Process RSS includes native allocations but is not a per-operation peak; Linux ARM64 results are not Android/Bionic results."
}, null, 2));
