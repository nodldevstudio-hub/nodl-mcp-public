import { NodeMetadataEntry, NodePortMetadata } from './nodeCatalog.js';

export function isConnectionTypeCompatible(
    fromPort: NodePortMetadata,
    toPort: NodePortMetadata,
): boolean {
    const fromTypes = normalizePortTypes(fromPort.type);
    const toTypes = normalizePortTypes(toPort.type);

    if (fromTypes.size === 0 || toTypes.size === 0) {
        return true;
    }

    if (fromTypes.has('any') || toTypes.has('any')) {
        return true;
    }

    for (const fromType of fromTypes) {
        if (toTypes.has(fromType)) {
            return true;
        }
    }

    return false;
}

export function findNodeCatalogEntry(
    catalog: NodeMetadataEntry[],
    nodeType: string,
): NodeMetadataEntry | null {
    return catalog.find((entry) => entry.type === nodeType) ?? null;
}

export function findPort(
    ports: NodePortMetadata[] | undefined,
    portName: string,
): NodePortMetadata | null {
    if (!ports) {
        return null;
    }

    const exact = ports.find((port) => port.name === portName);
    if (exact) {
        return exact;
    }

    return (
        ports.find(
            (port) => port.name.toLowerCase() === portName.toLowerCase(),
        ) ?? null
    );
}

function normalizePortTypes(portType: string | undefined): Set<string> {
    if (!portType) {
        return new Set();
    }

    const parts = portType
        .split('|')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);

    return new Set(parts);
}
