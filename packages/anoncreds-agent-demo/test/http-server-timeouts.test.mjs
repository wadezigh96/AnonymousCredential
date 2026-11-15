import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { configureHttpServer } from "../src/roles/http.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function listenWithShortTimeouts() {
  const server = configureHttpServer(createServer((request, response) => {
    request.resume();
    request.once("end", () => {
      if (!response.headersSent) response.writeHead(200).end("ok");
    });
  }), { headersTimeout: 1_000, requestTimeout: 1_000, keepAliveTimeout: 500 });
  // Node checks request/header deadlines periodically; shorten the test-only
  // sweep interval without changing the timeouts being exercised.
  server.connectionsCheckingInterval = 100;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, port: server.address().port };
}

function rawConnection(port) {
  const socket = connect(port, "127.0.0.1");
  return once(socket, "connect").then(() => socket);
}

async function collectUntilClosed(socket, timeoutMs = 3_000) {
  let data = "";
  socket.setEncoding("utf8");
  socket.on("data", chunk => { data += chunk; });
  await Promise.race([
    once(socket, "close"),
    delay(timeoutMs).then(() => { throw new Error("socket did not close before timeout"); }),
  ]);
  return data;
}

function closeServer(server) {
  return new Promise(resolve => {
    server.closeAllConnections();
    server.close(resolve);
  });
}

test("actual HTTP server rejects incomplete headers after configured header timeout", async t => {
  const { server, port } = await listenWithShortTimeouts();
  t.after(() => closeServer(server));
  const socket = await rawConnection(port);
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nX-Incomplete:");
  const response = await collectUntilClosed(socket);
  assert.match(response, /408 Request Timeout|HTTP\/1\.[01] 408|^$/);
});

test("actual HTTP server expires a deliberately slow header transmission", async t => {
  const { server, port } = await listenWithShortTimeouts();
  t.after(() => closeServer(server));
  const socket = await rawConnection(port);
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\n");
  await delay(1_500);
  if (!socket.destroyed) socket.write("Content-Length: 0\r\n\r\n");
  const response = await collectUntilClosed(socket);
  assert.match(response, /408 Request Timeout|HTTP\/1\.[01] 408|^$/);
});

test("actual HTTP server times out an incomplete JSON body", async t => {
  const { server, port } = await listenWithShortTimeouts();
  t.after(() => closeServer(server));
  const socket = await rawConnection(port);
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 20\r\nConnection: close\r\n\r\n{}");
  const response = await collectUntilClosed(socket);
  assert.match(response, /408 Request Timeout|HTTP\/1\.[01] 408|^$/);
});

test("client disconnect aborts body upload and pending server shutdown completes", async t => {
  const { server, port } = await listenWithShortTimeouts();
  t.after(() => { if (server.listening) server.closeAllConnections(); });
  const aborted = new Promise(resolve => server.once("request", request => request.once("aborted", resolve)));
  const socket = await rawConnection(port);
  socket.write("POST / HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{}");
  socket.destroy();
  await aborted;
  const closed = once(server, "close");
  server.close();
  await Promise.race([closed, delay(2_000).then(() => { throw new Error("server shutdown remained pending"); })]);
});
