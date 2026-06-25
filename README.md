# MCP Registry (self-hosted allowlist)

A minimal MCP registry that serves an **allowlist** of approved MCP servers to
GitHub Copilot, following the [v0.1 MCP registry specification](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-registry).

Currently allows: **Atlassian Rovo MCP Server** (`com.atlassian/atlassian-mcp-server`).

## Endpoints

GitHub Copilot appends these paths to the base registry URL you configure:

- `GET /v0.1/servers` — list all allowed servers
- `GET /v0.1/servers/{serverName}/versions/latest` — latest version of a server
- `GET /v0.1/servers/{serverName}/versions/{version}` — a specific version
- `POST /v0.1/servers` — add a server (requires admin key)
- `DELETE /v0.1/servers/{serverName}` — remove a server (requires admin key)

All responses include the CORS headers GitHub requires.

### Admin endpoints

`POST`/`DELETE` require an `ADMIN_API_KEY` set in the environment (see
[.env.example](.env.example)), sent as `Authorization: Bearer <key>`. If the
key isn't configured, both endpoints return `503`.

```sh
# Add a server
curl -X POST http://localhost:8080/v0.1/servers \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"server": {"name": "com.example/my-mcp-server", "description": "...", "version": "1.0.0", "remotes": [{"type": "streamable-http", "url": "https://example.com/mcp"}]}}'

# Remove a server
curl -X DELETE http://localhost:8080/v0.1/servers/com.example%2Fmy-mcp-server \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

## Run locally

```sh
npm install
npm start
# http://localhost:8080/v0.1/servers
```

## Run with Docker

```sh
cp .env.example .env   # set ADMIN_API_KEY
docker compose up --build
# http://localhost:8080/v0.1/servers
```

## Deploy on your domain

1. Build and run the container on your host (or behind your existing
   orchestration).
2. Put it behind nginx (see [nginx.conf](nginx.conf)) to terminate TLS for your
   domain, e.g. `https://mcp-registry.yourdomain.com`.
3. Ensure the endpoint is reachable from the public internet — GitHub fetches it
   server-side. Optionally firewall it to GitHub's egress ranges
   (see https://api.github.com/meta).

## Point GitHub Copilot at it

In your **enterprise** or **organization** settings → **Copilot** → **MCP**:

1. Set **MCP servers in Copilot** = Enabled.
2. Set **MCP Registry URL** to the **base URL only**, e.g.
   `https://mcp-registry.yourdomain.com`
   (do **not** append `/v0.1/servers` — Copilot adds it automatically).
3. Set **Restrict MCP access to registry servers** = **Registry only**.

> Note: allowlist enforcement matches on the exact server `name`. Keep the
> `name` in [data/servers.json](data/servers.json) identical to the canonical
> server ID (`com.atlassian/atlassian-mcp-server`).

## Set up the MCP Registry Admin skill

This repository includes a GitHub Copilot Chat skill at
[.github/skills/mcp-registry-admin/SKILL.md](.github/skills/mcp-registry-admin/SKILL.md)
that can add, list, and delete servers through this registry API.

1. Make sure this folder exists in your workspace:
   `.github/skills/mcp-registry-admin/SKILL.md`.
2. Start the registry locally (or point to your deployed one):
   - Local: `http://localhost:8080`
   - Deployed: `https://your-domain`
3. Set the admin key used by `POST`/`DELETE`:
   - Put `ADMIN_API_KEY=<your-key>` in your `.env` file (or shell env).
4. (Optional, recommended) Save skill defaults in Copilot memory so you
   don't have to repeat them:
   - `registry_base_url=http://localhost:8080`
   - `registry_admin_bearer_token=<your-admin-key>`

Example prompts that trigger this skill:

- `what mcp servers do we have in the registry?`
- `add microsoft learn mcp`
- `delete markitdown`

Notes:

- Add operations in this skill research the official endpoint first and ask for
  confirmation before writing.
- Delete operations resolve casual names (for example `markitdown`) to the
  exact registered `name` before removing.

## Add or update servers

Either call the [admin API](#admin-endpoints) above, or edit
[data/servers.json](data/servers.json) directly. Each entry follows the v0.1
`server.json` schema. Bump `version` and the `_meta` block when the upstream
server changes. Restart the service to pick up manual file edits (the admin
API writes to the same file and takes effect immediately, no restart needed).
