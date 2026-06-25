import express from "express";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  // Local dev convenience; in Docker/prod the env vars are injected directly.
  process.loadEnvFile();
} catch {}

const PORT = process.env.PORT || 8080;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const SERVERS_FILE = join(__dirname, "data", "servers.json");

// Load the allowlist of MCP servers (v0.1 registry schema).
const data = JSON.parse(readFileSync(SERVERS_FILE, "utf8"));
const servers = data.servers ?? [];

const saveServers = () => {
  writeFileSync(SERVERS_FILE, JSON.stringify({ servers }, null, 2) + "\n");
};

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// CORS headers required by GitHub Copilot for fetching the registry.
app.use((_req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  next();
});

app.options(/^\/v0\.1\/servers.*/, (_req, res) => res.sendStatus(204));

// Requires `Authorization: Bearer <ADMIN_API_KEY>` on write endpoints.
const requireAdminKey = (req, res, next) => {
  if (!ADMIN_API_KEY) {
    return res.status(503).json({ error: "Admin API is not configured" });
  }
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme !== "Bearer" || token !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

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

// POST /v0.1/servers - add a server to the allowlist. Requires admin key.
app.post("/v0.1/servers", requireAdminKey, (req, res) => {
  const { server, _meta } = req.body ?? {};
  const name = server?.name;

  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Body must include server.name" });
  }

  if (findServer(name)) {
    return res.status(409).json({ error: `Server '${name}' already exists` });
  }

  const entry = {
    server,
    _meta: _meta ?? {
      "io.modelcontextprotocol.registry/official": {
        status: "active",
        isLatest: true,
      },
    },
  };

  servers.push(entry);
  saveServers();

  res.status(201).json(entry);
});

// DELETE /v0.1/servers/<name> - remove a server from the allowlist. Requires admin key.
app.delete(/^\/v0\.1\/servers\/(.+)$/, requireAdminKey, (req, res) => {
  const serverName = decodeURIComponent(req.params[0]);
  const index = servers.findIndex((entry) => entry.server?.name === serverName);

  if (index === -1) {
    return res.status(404).json({ error: "Server not found" });
  }

  const [removed] = servers.splice(index, 1);
  saveServers();

  res.json(removed);
});

// Malformed JSON bodies should get a clean JSON error, not Express's default HTML page.
app.use((err, _req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`MCP registry listening on port ${PORT}`);
});
