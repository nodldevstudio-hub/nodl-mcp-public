# Nodl MCP (Public)

MCP server to let AI clients interact with Nodl collaboration through public endpoints.

This server does not contain app secrets. It only works with user-provided short-lived collaboration tokens.

## What this MCP does

- Connects to a Nodl collaboration project room.
- Exposes graph mutation tools.
- Respects backend authorization (role + scopes).

Available tools:
- `join_project`
- `list_capabilities`
- `apply_graph_mutation`

## Install in your MCP client (JSON config)

Use `npx` so users do not need to clone anything.

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

1. Generate a collaboration token in Nodl app (Share / collaboration token endpoint).
2. In your AI client, call `join_project`:
   - `projectId`: project id
   - `token`: short-lived token
   - `endpoint` (optional): defaults to `wss://realtime.nodl.dev`
3. Call `list_capabilities` to confirm role/scopes/expiry.
4. Call `apply_graph_mutation`.

## Tool contracts

### `join_project`

Input:

```json
{
  "projectId": "42",
  "token": "<short-lived-token>",
  "endpoint": "wss://realtime.nodl.dev"
}
```

Output:
- `session` (`projectId`, `mode`, `role`)
- decoded token metadata (`scopes`, `exp`)

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

## Security model

- Token is kept in memory only for the MCP process lifetime.
- Token is never persisted by this package.
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
- endpoint is correct (`wss://realtime.nodl.dev` by default)
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
