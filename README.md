# Nodl MCP

MCP server to let AI clients interact with Nodl collaboration through public endpoints.

This server does not contain app secrets. It only works with user-provided short-lived collaboration tokens.

## What this MCP does

- Connects to a Nodl collaboration project room.
- Exposes graph mutation tools.
- Respects backend authorization (role + scopes).

Available tools:
- `join_project`
- `list_capabilities`
- `list_nodes`
- `list_current_nodes`
- `describe_current_nodes`
- `add_node`
- `remove_node`
- `move_node`
- `edit_node_properties`
- `describe_node_properties`
- `connect_nodes`
- `disconnect_nodes`
- `move_cursor`

## Install in your MCP client (JSON config)

Use `npx` so users do not need to clone anything.
Private registry and scoped package names are supported (for example `@your-scope/nodl-collab-mcp`).

```json
{
  "mcpServers": {
    "nodl": {
      "command": "npx",
      "args": ["-y", "nodl-collab-mcp"]
    }
  }
}
```

Notes:
- Restart your MCP client after editing config.
- No token is stored in the config.

## First usage flow

1. Generate an MCP agent token in Nodl app (`Share -> Collaborate -> MCP token`).
2. In your AI client, call `join_project`:
   - `token`: short-lived token
   - `endpoint` (optional): set to your production backend collaboration namespace (example: `wss://api.nodl.dev/collaboration`)
3. Call `list_capabilities` to confirm role/scopes/expiry.
4. Use dedicated tools for common graph operations (`add_node`, `move_node`, `connect_nodes`, ...).

## Endpoint override with `.env` (production)

Create a local `.env` file (not committed) at package root:

```env
NODL_COLLAB_ENDPOINT=wss://api.nodl.dev/collaboration
```

This override is automatically loaded on startup (`dotenv/config`).
Set this endpoint to the unified backend Socket.IO namespace URL.

## Tool contracts

### `join_project`

Input:

```json
{
  "token": "<short-lived-token>",
  "endpoint": "wss://api.nodl.dev/collaboration",
  "displayName": "MCP - Claude"
}
```

Output:
- `endpointUsed` (effective Socket.IO endpoint used by MCP)
- `session` (`projectId`, `mode`, `role`, `snapshotSummary`)
- decoded token metadata (`scopes`, `exp`)
- cursor identity metadata (`actorId`, `displayName`) used by `move_cursor`
- full snapshot omitted by default (set `includeSnapshot: true` to include it)
- fails fast if token is expired or token has no `projectId` claim
- ACK handling supports both Socket.IO callback shapes to avoid false `join timeout or rejection` errors.

### `list_capabilities`

Input:

```json
{
  "token": "<short-lived-token>"
}
```

Output:
- role
- scopes
- expiration status

### `list_nodes`

Input:

```json
{}
```

Output:
- local node catalog from `assets/node-metadata.json` (type, category, ports, properties)

### `list_current_nodes`

Input:

```json
{}
```

Output:
- lightweight session-scoped summary with:
  - `initialized`
  - `sessionScoped: true`
  - `lastUpdatedAt`
  - `counts` (`nodes`, `connections`)
  - `nodeIdsPreview`
  - `connectionIdsPreview`

Optional input:
- `includeFullState: true` to include full `nodes` and `connections`
- `previewLimit` to tune preview size in summary mode (default 20, max 200)

### `describe_current_nodes`

Input:

```json
{
  "nodeIds": ["noise-1", "edge-1"],
  "includeRaw": false
}
```

Output:
- targeted node diagnostics for only requested IDs:
  - `nodeType` and fallback `type`
  - available object `keys`
  - `x` / `y`
  - `propertyKeys`
- use this when `connect_nodes` complains about missing `nodeType/type` fields.

Semantics:
- this state is scoped to the active MCP process/session only,
- it starts empty on `join_project` (no historical snapshot fetch),
- it is updated on:
  - successful local mutation ACK,
  - incoming `collaboration:mutation` events from other actors.

### Dedicated graph tools

- `add_node`: validated wrapper over `addNode`
- `remove_node`: validated wrapper over `deleteNode`
- `move_node`: validated wrapper over `moveNode`
- `edit_node_properties`: validated wrapper over `updateNodeProperties`
- `describe_node_properties`: returns allowed property schema and current values for a node
  - Important: this tool returns runtime property `key` values (stable, non-translated) that should be used with `edit_node_properties`.
- `connect_nodes`: validated wrapper over `addConnection`
- `disconnect_nodes`: validated wrapper over `deleteConnection`
- `move_cursor`: emits collaboration cursor updates

### Type compatibility on `connect_nodes`

`connect_nodes` validates source output and target input compatibility against the local node catalog:
- it resolves the current node types from `list_current_nodes` state,
- resolves port definitions from `list_nodes` catalog,
- rejects the call when output/input port types are incompatible.

### Safe property editing flow

Before calling `edit_node_properties`, call `describe_node_properties`:
- resolve allowed property names for the exact node type,
- inspect expected value types (`number`, `boolean`, `select`, etc.),
- inspect allowed `select` options and numeric bounds,
- inspect current value/mode to avoid invalid updates.

## Security model

- Token is kept in memory only for the MCP process lifetime.
- Token is never persisted by this package.
- Token parsing errors are masked (no plaintext token emitted in errors).
- Backend is authoritative for access control.
- Expired/invalid token is rejected by backend.

## Troubleshooting

All tool errors include an inline `Mitigation:` hint to guide next steps (token refresh, websocket mode mismatch, missing scopes, schema fixes, targeted node inspection, etc.).

### Auth errors (`ENEEDAUTH`, `E404 scope not found`) during npm publish

This is CI/package publishing configuration, not MCP runtime usage.

- Runtime users only need:
  - `npx nodl-collab-mcp`
  - valid Nodl collaboration token

### `join_project` fails

Check:
- token not expired
- endpoint is correct (`endpoint` argument has priority, then `NODL_COLLAB_ENDPOINT`/`COLLAB_SECURE_WS_URL`)
- role/scopes allow requested actions

## Local development

```bash
npm install
npm run build
npm start
```

When run directly (`npx -y nodl-collab-mcp`), the server stays waiting on stdio.
This is expected. Startup logs are printed to `stderr`.
Set `NODL_MCP_SILENT=true` to disable startup logs.
