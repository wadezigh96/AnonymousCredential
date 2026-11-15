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

export function createRateLimiter({ limit = 60, windowMs = 60_000, now = Date.now, maxEntries = 10_000 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError("Rate limit must be a positive integer");
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new TypeError("Rate limit window must be a positive integer");
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError("Rate limiter capacity must be a positive integer");
  const buckets = new Map();

  return function allow(request, response) {
    const timestamp = now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key);
    }
    const address = request.socket?.remoteAddress ?? "unknown";
    const key = address.startsWith("::ffff:") ? address.slice(7) : address;
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxEntries) {
        sendJson(response, 503, { error: "Rate limiter capacity reached" });
        return false;
      }
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
      response.setHeader("retry-after", String(retryAfter));
      sendJson(response, 429, { error: "Too many requests" });
      return false;
    }
    bucket.count += 1;
    return true;
  };
}

export function configuredRateLimit(name, fallback = 60) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(name + " must be a positive integer");
  }
  return value;
}

export class HttpRequestError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "HttpRequestError";
    this.statusCode = statusCode;
  }
}

export async function readJson(request, maxBytes = 1024 * 1024) {
  const contentType = request.headers?.["content-type"];
  if (typeof contentType !== "string" || !/^application\\/json(?:\\s*;|$)/i.test(contentType)) {
    throw new HttpRequestError(415, "Content-Type must be application/json");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpRequestError(413, "Request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpRequestError(400, "Invalid JSON request body"); }
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
