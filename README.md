# nodl-collab-mcp (public)

Public MCP server for Nodl collaboration.

This package is intentionally stateless and does not contain any application secret.
It only connects to public Nodl endpoints with a user-provided short-lived token.

## Security model

- No backend secret is embedded.
- No token is written to disk.
- Token is kept in memory for the active MCP process only.
- Backend remains authoritative for role/scope enforcement.

## Tools

- `join_project`
  - input: `projectId`, `token`, optional `endpoint`
  - output: session status (`mode`, `role`) + decoded token info
- `list_capabilities`
  - input: `token`
  - output: decoded scopes/role/expiry
- `apply_graph_mutation`
  - input: `type`, `payload`
  - output: accepted/rejected (+ reason)

## Local development

```bash
npm install
npm run build
npm start
```

## npx usage

After publishing:

```bash
npx @nodldevstudio-hub/nodl-collab-mcp
```

## CI publish (GitHub Actions + environment secret)

Workflow: `.github/workflows/publish.yml`

Requirements:
- Create environment `release` in GitHub repo settings.
- Add environment secret `NPM_TOKEN` (npm Automation token).
- Enable required reviewers on environment `release`.

Trigger options:
- Push a tag like `v0.1.1`
- Or run `workflow_dispatch` from `main`

## Publish manually (fallback)

```bash
npm publish --access public
```
