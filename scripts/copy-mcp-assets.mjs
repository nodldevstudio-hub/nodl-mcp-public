import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve(__dirname, '../src/mcp/assets');
const destinationDir = path.resolve(__dirname, '../dist/mcp/assets');

async function copyDirectoryRecursive(fromDir, toDir) {
    await mkdir(toDir, { recursive: true });

    const entries = await readdir(fromDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(fromDir, entry.name);
        const destinationPath = path.join(toDir, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(sourcePath, destinationPath);
            continue;
        }

        if (entry.isFile()) {
            await copyFile(sourcePath, destinationPath);
        }
    }
}

async function main() {
    const sourceStats = await stat(sourceDir);
    if (!sourceStats.isDirectory()) {
        throw new Error(`Asset source is not a directory: ${sourceDir}`);
    }

    await copyDirectoryRecursive(sourceDir, destinationDir);
    process.stderr.write(
        `[build] copied MCP assets from ${sourceDir} to ${destinationDir}\n`,
    );
}

main().catch((error) => {
    process.stderr.write(`[build] failed to copy MCP assets: ${error.message}\n`);
    process.exitCode = 1;
});
