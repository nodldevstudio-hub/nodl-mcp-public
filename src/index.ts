#!/usr/bin/env node

import 'dotenv/config';
import { startMcpServer } from './mcp/server.js';

async function main(): Promise<void> {
    if (process.env.NODL_MCP_SILENT !== 'true') {
        console.error('[nodl-collab-mcp] starting MCP stdio server...');
        if (process.env.NODL_COLLAB_ENDPOINT) {
            console.error(
                `[nodl-collab-mcp] default endpoint override: ${process.env.NODL_COLLAB_ENDPOINT}`
            );
        }
    }
    await startMcpServer();
    if (process.env.NODL_MCP_SILENT !== 'true') {
        console.error('[nodl-collab-mcp] ready (waiting for MCP client calls)');
    }
}

main().catch((error) => {
    console.error('[nodl-collab-mcp] fatal error', error);
    process.exit(1);
});
