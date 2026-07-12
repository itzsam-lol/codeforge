/**
 * Minimal allowlist-only forward proxy for the repo/API-challenge grading
 * pool (SECURITY.md "Isolation of untrusted code"). Grading containers sit on
 * an --internal Docker network with no route to the internet; their only way
 * out is through this proxy, which only tunnels CONNECT (HTTPS) and plain
 * HTTP requests to hosts on ALLOWED_HOSTS. Everything else gets a 403 and the
 * TCP connection is closed. No dependencies: vanilla Node `http` + `net`.
 */
const http = require("http");
const net = require("net");
const { URL } = require("url");

const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function hostAllowed(host) {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

const server = http.createServer((req, res) => {
  // Plain HTTP proxying (rare for git/npm, which use HTTPS, but handled for completeness).
  let target;
  try {
    target = new URL(req.url, `http://${req.headers.host}`);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }
  if (!hostAllowed(target.hostname)) {
    res.writeHead(403, { "Content-Type": "text/plain" }).end(`Egress blocked: ${target.hostname} is not on the allowlist\n`);
    return;
  }
  const upstream = http.request(
    { hostname: target.hostname, port: target.port || 80, path: target.pathname + target.search, method: req.method, headers: req.headers },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", () => res.writeHead(502).end("Bad gateway"));
  req.pipe(upstream);
});

// HTTPS tunneling: CONNECT host:port, then raw byte-pipe once allowed.
server.on("connect", (req, clientSocket, head) => {
  const [host, portStr] = req.url.split(":");
  const port = Number(portStr) || 443;
  if (!hostAllowed(host)) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    clientSocket.end();
    return;
  }
  const upstream = net.connect(port, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.end());
  clientSocket.on("error", () => upstream.end());
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`egress proxy listening on :${PORT}, allowlist: ${ALLOWED_HOSTS.join(", ")}`);
});
