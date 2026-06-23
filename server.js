import express from "express";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8080;

// Load the allowlist of MCP servers (v0.1 registry schema).
const data = JSON.parse(
  readFileSync(join(__dirname, "data", "servers.json"), "utf8"),
);
const servers = data.servers ?? [];

const app = express();
app.disable("x-powered-by");

// CORS headers required by GitHub Copilot for fetching the registry.
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  next();
});

app.options(/^\/v0\.1\/servers.*/, (_req, res) => res.sendStatus(204));

// Liveness probe.
app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

// GET /v0.1/servers - list all allowed MCP servers.
app.get("/v0.1/servers", (_req, res) => {
  res.json({ servers, metadata: { count: servers.length } });
});

const findServer = (name) =>
  servers.find((entry) => entry.server?.name === name);

// Server names can contain "/" (e.g. "com.atlassian/atlassian-mcp-server"),
// which GitHub may send raw or percent-encoded. Match the full path and parse
// out the name and the trailing "/versions/<version|latest>" segment manually.
app.get(/^\/v0\.1\/servers\/(.+)\/versions\/([^/]+)$/, (req, res) => {
  const serverName = decodeURIComponent(req.params[0]);
  const version = decodeURIComponent(req.params[1]);

  const entry = findServer(serverName);
  if (!entry) return res.status(404).json({ error: "Server not found" });

  if (version !== "latest" && entry.server?.version !== version) {
    return res.status(404).json({ error: "Version not found" });
  }

  res.json(entry);
});

app.listen(PORT, () => {
  console.log(`MCP registry listening on port ${PORT}`);
});
