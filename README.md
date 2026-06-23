# MCP Registry (self-hosted allowlist)

A minimal MCP registry that serves an **allowlist** of approved MCP servers to
GitHub Copilot, following the [v0.1 MCP registry specification](https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-mcp-usage/configure-mcp-registry).

Currently allows: **Atlassian Rovo MCP Server** (`com.atlassian/atlassian-mcp-server`).

## Endpoints

GitHub Copilot appends these paths to the base registry URL you configure:

- `GET /v0.1/servers` — list all allowed servers
- `GET /v0.1/servers/{serverName}/versions/latest` — latest version of a server
- `GET /v0.1/servers/{serverName}/versions/{version}` — a specific version

All responses include the CORS headers GitHub requires.

## Run locally

```sh
npm install
npm start
# http://localhost:8080/v0.1/servers
```

## Run with Docker

```sh
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

## Add or update servers

Edit [data/servers.json](data/servers.json). Each entry follows the v0.1
`server.json` schema. Bump `version` and the `_meta` block when the upstream
server changes. Restart the service to pick up changes.
