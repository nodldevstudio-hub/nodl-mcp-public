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
- `add_node`
- `remove_node`
- `move_node`
- `edit_node_properties`
- `connect_nodes`
- `disconnect_nodes`
- `move_cursor`
- `apply_graph_mutation`

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
   - `projectId`: project id
   - `token`: short-lived token
   - `endpoint` (optional): defaults to `NODL_COLLAB_ENDPOINT` env var, else `wss://realtime.nodl.dev`
3. Call `list_capabilities` to confirm role/scopes/expiry.
4. Use dedicated tools for common graph operations (`add_node`, `move_node`, `connect_nodes`, ...).
5. Use `apply_graph_mutation` for expert/fallback raw operations.

## Endpoint override with `.env` (dev)

Create a local `.env` file (not committed) at package root:

```env
NODL_COLLAB_ENDPOINT=ws://localhost:1235/collaboration
```

This override is automatically loaded on startup (`dotenv/config`).

## Tool contracts

### `join_project`

Input:

```json
{
  "projectId": "42",
  "token": "<short-lived-token>",
  "endpoint": "ws://localhost:1235/collaboration",
  "displayName": "MCP - Claude"
}
```

Output:
- `session` (`projectId`, `mode`, `role`)
- decoded token metadata (`scopes`, `exp`)
- cursor identity metadata (`actorId`, `displayName`) used by `move_cursor`
- fails fast if token is expired or token project does not match requested project

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

### `apply_graph_mutation`

Input:

```json
{
  "type": "addNode",
  "payload": {
    "id": "node-1",
    "data": { "type": "math/add" }
  }
}
```

Output:
- `ok: true|false`
- optional `reason` when rejected

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
- session-scoped cache with:
  - `initialized`
  - `sessionScoped: true`
  - `lastUpdatedAt`
  - `nodes`
  - `connections`

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
- `connect_nodes`: validated wrapper over `addConnection`
- `disconnect_nodes`: validated wrapper over `deleteConnection`
- `move_cursor`: emits collaboration cursor updates

### Type compatibility on `connect_nodes`

`connect_nodes` validates source output and target input compatibility against the local node catalog:
- it resolves the current node types from `list_current_nodes` state,
- resolves port definitions from `list_nodes` catalog,
- rejects the call when output/input port types are incompatible.

## Security model

- Token is kept in memory only for the MCP process lifetime.
- Token is never persisted by this package.
- Token parsing errors are masked (no plaintext token emitted in errors).
- Backend is authoritative for access control.
- Expired/invalid token is rejected by backend.

## Troubleshooting

### Auth errors (`ENEEDAUTH`, `E404 scope not found`) during npm publish

This is CI/package publishing configuration, not MCP runtime usage.

- Runtime users only need:
  - `npx nodl-collab-mcp`
  - valid Nodl collaboration token

### `join_project` fails

Check:
- token not expired
- token project matches `projectId`
- endpoint is correct (`NODL_COLLAB_ENDPOINT` env var or `wss://realtime.nodl.dev` by default)
- role/scopes allow requested actions

### `apply_graph_mutation` returns rejected

Likely causes:
- role is `viewer`
- missing `collab:write` scope
- project is not in websocket mode

## Local development

```bash
npm install
npm run build
npm start
```

When run directly (`npx -y nodl-collab-mcp`), the server stays waiting on stdio.
This is expected. Startup logs are printed to `stderr`.
Set `NODL_MCP_SILENT=true` to disable startup logs.
