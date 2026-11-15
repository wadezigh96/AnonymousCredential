import { createHash, timingSafeEqual } from "node:crypto";

export function requireApiToken(name) {
  const token = process.env[name];
  if (typeof token !== "string" || token.length < 32) {
    throw new Error(name + " must be configured with at least 32 characters");
  }
  return token;
}

export function requireBearerToken(request, response, expectedToken) {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? /^Bearer ([A-Za-z0-9._~+/-]+)$/.exec(header) : null;
  const supplied = match ? match[1] : "";
  const expectedDigest = createHash("sha256").update(expectedToken, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const valid = timingSafeEqual(expectedDigest, suppliedDigest);
  if (valid) return true;
  response.setHeader("www-authenticate", 'Bearer realm="anonymesh"');
  sendJson(response, 401, { error: "Unauthorized" });
  return false;
}

export async function readJson(request, maxBytes = 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

export function startRoleServer(server, { host = "127.0.0.1", port = 0 } = {}) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve({ host, port: address.port, close: () => new Promise(done => server.close(done)) });
    });
  });
}

export function routeError(response, error) {
  const message = error instanceof Error ? error.message : "Request failed";
  sendJson(response, 400, { error: message });
}
