import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface NodePortMetadata {
    name: string;
    type?: string;
    optional?: boolean;
    tooltip?: string;
}

export interface NodePropertyMetadata {
    name: string;
    type?: string;
    defaultValue?: unknown;
    category?: string;
}

export interface NodeMetadataEntry {
    type: string;
    displayName?: string;
    category?: string;
    subcategory?: string;
    description?: string;
    tags?: string[];
    inputs?: NodePortMetadata[];
    outputs?: NodePortMetadata[];
    properties?: NodePropertyMetadata[];
}

let cachedCatalog: NodeMetadataEntry[] | null = null;

export async function loadNodeCatalog(): Promise<NodeMetadataEntry[]> {
    if (cachedCatalog) {
        return cachedCatalog;
    }

    const candidatePaths = resolveCatalogCandidates();
    let lastError: Error | null = null;

    for (const candidate of candidatePaths) {
        try {
            const raw = await readFile(candidate, 'utf8');
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('node-metadata.json root must be an array');
            }
            cachedCatalog = parsed as NodeMetadataEntry[];
            return cachedCatalog;
        } catch (error) {
            lastError = error as Error;
        }
    }

    throw new Error(
        `Unable to load node catalog from local assets (${lastError?.message ?? 'unknown error'}).`,
    );
}

function resolveCatalogCandidates(): string[] {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    return [
        path.resolve(__dirname, '../assets/node-metadata.json'),
        path.resolve(process.cwd(), 'dist/mcp/assets/node-metadata.json'),
        path.resolve(process.cwd(), 'src/mcp/assets/node-metadata.json'),
    ];
}
