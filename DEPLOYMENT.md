# MCP Registry — Research & Decisions

Context notes for whoever finishes the deployment. Covers *why* this exists, the
key facts we learned, the choices we made, and what's left to do.

## Goal

Set up a company MCP registry for GitHub Copilot that **whitelists only the
Atlassian MCP server** (Jira/Confluence/Compass). Enforce "Registry only" so
developers can't use other MCP servers.

## What we learned (the important bits)

1. **A registry is an HTTPS API, not a single JSON file.**
   GitHub takes the **base URL** you configure and appends paths to it:
   - `GET /v0.1/servers`
   - `GET /v0.1/servers/{serverName}/versions/latest`
   - `GET /v0.1/servers/{serverName}/versions/{version}`

   Our first attempt (a single `registry.json` on raw GitHub) failed because
   one static file can't answer those three sub-paths.

2. **The schema is the v0.1 MCP registry spec — NOT the `mcpServers` config
   format.** Our first file used the VS Code / Claude-desktop `mcpServers`
   (`command`/`args`/`npx`) shape, which the registry does not accept. Atlassian
   is a **remote HTTP** server, not an `npx` package.

3. **CORS is required.** All `/v0.1/servers*` responses must include:
   ```
   Access-Control-Allow-Origin: *
   Access-Control-Allow-Methods: GET, OPTIONS
   Access-Control-Allow-Headers: Authorization, Content-Type
   ```

4. **Allowlist enforcement matches on the exact server `name`/ID.** Our entry's
   `name` must exactly equal the canonical Atlassian ID or it won't be allowed.
   Canonical values (from the live official registry,
   `registry.modelcontextprotocol.io`):
   - name: `com.atlassian/atlassian-mcp-server`
   - latest version: `1.1.2`
   - remote: `https://mcp.atlassian.com/v1/mcp` (streamable-http)

5. **Enforcement limitations (today).** Matching is name-based and can be
   bypassed by editing local config; strict install-blocking isn't available yet.
   Enterprise policy overrides org policy; "Registry only" beats "Allow all".

6. **The endpoint must be internet-reachable** — GitHub fetches it server-side.
   Firewalling to GitHub egress ranges (https://api.github.com/meta) is fine.

## Options we considered

| Option | Verdict |
| --- | --- |
| Fork & self-host `modelcontextprotocol/registry` (Go + Postgres + auth + publishing) | Overkill for a 1–3 server allowlist |
| Single static JSON on raw GitHub | Doesn't work — no routing, wrong schema |
| Static JSON behind nginx | Works, but the `/` in the server name makes file paths/encoding fiddly |
| **Small Node/Express service (chosen)** | Simple routing, matches our Docker + nginx stack, easy to maintain |

## Choices we made

- **Runtime:** Node + Express, containerized.
- **Servers allowed:** Atlassian only (Playwright/others can be added later).
- **Hosting:** our own domain, behind nginx terminating TLS, internet-reachable
  (can firewall to GitHub IP ranges).

## What's in this folder

- `server.js` — Express app; serves the 3 v0.1 routes + CORS. Handles the `/` in
  the server name whether GitHub sends it raw or percent-encoded.
- `data/servers.json` — the allowlist (edit this to add/update servers).
- `package.json`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- `nginx.conf` — TLS reverse-proxy + CORS example.
- `README.md` — run/deploy quickstart.

Verified locally: all three endpoints return correct v0.1 responses.

## Remaining deployment steps (TODO for colleague)

1. **Build & run** the container on the target host:
   ```sh
   docker compose up --build -d
   ```
2. **Front it with nginx** (see `nginx.conf`): set `server_name` to e.g.
   `mcp-registry.yourdomain.com`, install the TLS cert/key, point upstream at the
   container.
3. **DNS + firewall:** publish the hostname; ensure it's reachable from the
   public internet. Optionally restrict ingress to GitHub ranges
   (https://api.github.com/meta).
4. **Smoke test from outside:**
   ```sh
   curl https://mcp-registry.yourdomain.com/v0.1/servers
   ```
5. **Configure GitHub Copilot policy** (enterprise or org → Copilot → MCP):
   - MCP servers in Copilot = **Enabled**
   - MCP Registry URL = **base URL only**, e.g.
     `https://mcp-registry.yourdomain.com`
     (do **not** append `/v0.1/servers` — Copilot adds it)
   - Restrict MCP access to registry servers = **Registry only**
6. **Verify in an IDE:** reload, confirm Atlassian is available and that a
   non-listed server is blocked.

## Maintenance

- To add/update a server: edit `data/servers.json` (keep `name` matching the
  canonical ID), bump `version`, redeploy/restart.

## References

- Configure an MCP registry:
  https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-registry
- Configure MCP server access (policy/allowlist):
  https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-server-access
- MCP allowlist enforcement:
  https://docs.github.com/en/copilot/reference/mcp-allowlist-enforcement
- Live official registry (source of canonical Atlassian values):
  https://registry.modelcontextprotocol.io/v0.1/servers?search=atlassian
