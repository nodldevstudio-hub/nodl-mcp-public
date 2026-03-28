#!/usr/bin/env node

import 'dotenv/config';
import { startMcpServer } from './mcp/server.js';

async function main(): Promise<void> {
    await startMcpServer();
}

main().catch((error) => {
    console.error('[nodl-collab-mcp] fatal error', error);
    process.exit(1);
});
