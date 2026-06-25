---
name: mcp-registry-admin
description: >
  Adds, removes, and lists servers in the user's self-hosted MCP Registry
  (the official modelcontextprotocol/registry server.json API). Use this
  skill any time the user asks to add,
  register, delete, remove, or list MCP servers in "the registry" — including
  casual phrasing like "add the Microsoft Learn mcp", "register X mcp server",
  "delete Y mcp", "remove the Z server", or "what mcp servers do we have".
  Always trigger this for registry add/delete/list requests even if the user
  doesn't name the official server precisely — research the official server
  yourself before registering it.
---
 
# MCP Registry Admin
 
Manages entries in a self-hosted MCP Registry reachable at a user-provided
base URL (for example `http://localhost:8080`, `https://registry.example.com`).
This registry speaks the official
`modelcontextprotocol/registry` `v0.1` API and stores entries in the standard
`server.json` shape (`name`, `description`, `version`, `remotes`/`packages`).
 
This skill needs `curl` and shell access to the selected registry host — it's
meant to run somewhere that can actually reach the user's registry (e.g.
Claude Code, Claude Cowork, or a terminal session on their machine), not a
sandboxed environment without access to their network.
 
## Required first step: resolve registry base URL

- First, check persistent user memory for a previously saved registry base URL
  (for example in `/memories/mcp-registry-admin.md`, key:
  `registry_base_url=`). If found, use it as the default.
- At the start of the first registry action, only ask the user for the
  registry host/base URL when no saved value exists, or when they explicitly
  request a different environment/domain.
- If they provide a bare host without scheme, ask once whether to use `http`
  or `https` (do not guess).
- Normalize and store it as `REGISTRY_BASE_URL` for this session, then reuse it
  for all subsequent list/add/delete calls in that session.
- After a successful call (list/add/delete) with a newly provided URL, persist
  it back to user memory for future sessions.
- If the user explicitly says "local" or gives no preference, default to
  `http://localhost:8080` and state that choice.
- If the user says "just for this run" or equivalent, do not overwrite the
  saved persistent URL.

## Required first step: resolve auth bearer token for write calls

- First, check persistent user memory for a previously saved bearer token
  (for example in `/memories/mcp-registry-admin.md`, key:
  `registry_admin_bearer_token=`). If found, use it as the default token for
  write operations.
- At the start of the first write action (add/delete), only ask the user for
  the bearer token when no saved value exists, or when they explicitly request
  a different token.
- Store the resolved token as `AUTH_BEARER_TOKEN` for this session, and reuse
  it for all subsequent write calls in that session.
- After a successful write call with a newly provided token, persist it back
  to user memory for future sessions.
- If the user says "just for this run" or equivalent, do not overwrite the
  saved persistent token.
- If the user explicitly provides a temporary token (for example `test`), use
  `Authorization: Bearer <that token>` exactly as provided.

## Assumptions
 
- Write calls use `AUTH_BEARER_TOKEN` resolved from the auth step above.
- The registry is up at `REGISTRY_BASE_URL`. If `curl` can't connect,
  say so plainly (e.g. "the registry doesn't seem to be running") rather than
  retrying blindly.
## Listing servers
 
```bash
curl -s "$REGISTRY_BASE_URL/v0.1/servers"
```
 
Pipe through `jq` if available for readability. No auth header needed for
GET (per the spec — add the Bearer header too if the server unexpectedly
demands it).
 
Use this:
- Whenever the user just asks what's registered
- Before **adding**, to check whether something equivalent already exists
- Before **deleting**, to find the exact `name` string the user means —
  people refer to servers casually ("Microsoft mcp"), but the registry
  stores a specific reverse-DNS-style name (e.g. `com.microsoft/learn`), so
  you need to match casual → actual before you can delete or report back.
The list may be paginated (`metadata.nextCursor` in the response) — if the
registry holds more than a handful of entries and you don't see what you're
looking for, follow the cursor before concluding it isn't there.
 
## Adding a server
 
Trigger phrases: "add the X mcp", "register X mcp server", etc.
 
1. **Research the official server first.** Web search for X's official
   *remote* MCP endpoint — prefer pages published directly by the vendor
   (their own docs/blog, or their official GitHub org) over third-party
   aggregator listings. You need:
   - The remote URL itself
   - Transport type: `streamable-http` (most common / preferred) or `sse`
   - A short, accurate one-line description
   - A version string, if the vendor publishes one — if not, `1.0.0` is a
     reasonable default for a remote-only entry
   Don't invent a URL or guess at one that "looks right." If you can't find
   an official remote endpoint after a real search, tell the user that
   instead of fabricating one.
2. **Pick a name.** Reverse-DNS style, matching the vendor's domain or GitHub
   org — e.g. `com.microsoft/learn`, `io.github.<org>/<repo>`. Lowercase,
   short, no spaces.
3. **Check for collisions** — GET the current list (above) and see if this
   name, or an obvious duplicate under a different name, already exists.
4. **Confirm with the user before writing anything.** Show exactly what
   you're about to register — name, description, version, transport type,
   and URL — and wait for an explicit yes. Don't run the POST on a guess or
   on an ambiguous "yes go ahead" to a different question; get a clear
   confirmation of *this* payload.
5. **Execute**, once confirmed:
   ```bash
    curl -X POST "$REGISTRY_BASE_URL/v0.1/servers" \
     -H "Authorization: Bearer $AUTH_BEARER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "server": {
         "name": "com.example/my-mcp-server",
         "description": "...",
         "version": "1.0.0",
         "remotes": [{"type": "streamable-http", "url": "https://example.com/mcp"}]
       }
     }'
   ```

   **Windows PowerShell-safe option (preferred on Windows):**
   Use `curl.exe` (not the PowerShell `curl` alias), build JSON in a
   here-string, write it as UTF-8 without BOM, then post from file.
   ```powershell
   $payloadPath = Join-Path $PWD "mcp-payload.json"
   $json = @'
   {
     "server": {
       "name": "com.example/my-mcp-server",
       "description": "...",
       "version": "1.0.0",
       "remotes": [
         { "type": "streamable-http", "url": "https://example.com/mcp" }
       ]
     }
   }
   '@

   $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
   [System.IO.File]::WriteAllText($payloadPath, $json, $utf8NoBom)

   curl.exe -X POST "$env:REGISTRY_BASE_URL/v0.1/servers" \
     -H "Authorization: Bearer $env:AUTH_BEARER_TOKEN" \
     -H "Content-Type: application/json" \
     --data-binary "@$payloadPath"

   Remove-Item $payloadPath -ErrorAction SilentlyContinue
   ```
 
6. **Verify.** Re-GET the list and confirm the new entry shows up; surface
   the registry's response body if it returned an error instead of success.
## Deleting a server
 
Trigger phrases: "delete X mcp", "remove X mcp server", etc.
 
1. GET the current list and find the entry that matches what the user means
   by "X" (casual name → registered `name`).
2. **Exactly one match** → go ahead and delete it directly (no confirmation
   needed for delete) — just say out loud which exact `name` you're removing
   as you do it, so the user can stop you if it's wrong.
3. **Zero matches** → tell the user nothing matching that was found, and show
   them what *is* currently registered so they can clarify.
4. **More than one plausible match** → ask which one before deleting
   anything; don't pick for them.
5. **Execute:**
   ```bash
    curl -X DELETE "$REGISTRY_BASE_URL/v0.1/servers/com.example%2Fmy-mcp-server" \
     -H "Authorization: Bearer $AUTH_BEARER_TOKEN"
   ```
 
   The `name` must be URL-encoded in the path — in particular the `/`
   becomes `%2F`. To encode reliably rather than by hand:
   ```bash
   python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "com.example/my-mcp-server"
   ```

   **Windows PowerShell encoding:**
   ```powershell
   $name = "com.example/my-mcp-server"
   $encoded = [System.Uri]::EscapeDataString($name)
   curl.exe -X DELETE "$env:REGISTRY_BASE_URL/v0.1/servers/$encoded" \
     -H "Authorization: Bearer $env:AUTH_BEARER_TOKEN"
   ```

   If a user explicitly provides a temporary token for testing, use that exact
   token in the header for this run (for example `Bearer test`) instead of
   replacing the saved token.
 
6. **Verify.** Re-GET the list and confirm it's gone; report success (or the
   error body) back to the user.
## server.json field cheat-sheet
 
- `name` (required) — unique, reverse-DNS style id
- `description` (required)
- `version` (required) — plain semver (`1.2.0`), not a range
- `remotes` (array) — `{"type": "streamable-http" | "sse", "url": "..."}`;
  this is what you'll use for almost every "add this hosted MCP server"
  request
- `packages` (array, optional) — for servers distributed via npm/pypi/oci and
  run locally (stdio) rather than hosted at a URL; only relevant if the user
  is registering something that isn't a remote endpoint
## Troubleshooting
 
- `Connection refused` → the registry process isn't running; say so, don't
  retry silently.
- `401`/`403` on POST or DELETE → the resolved bearer token is missing, wrong,
  or stale; ask the user for an updated token and retry. Persist the new token
  unless the user said it is only for this run.
- `409` or a "name already exists" error on POST → there's already an entry
  with that name; show the user the existing entry and ask whether they want
  to delete-then-re-add, pick a different name, or skip it.