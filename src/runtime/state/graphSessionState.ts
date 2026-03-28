import { MUTATION_TYPES } from '../../mcp/constants/mutationTypes.js';

export interface SessionNodeState {
    nodeId: string;
    nodeType?: string;
    x?: number;
    y?: number;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface SessionConnectionState {
    id: string;
    fromNodeId: string;
    fromPort: string;
    toNodeId: string;
    toPort: string;
    [key: string]: unknown;
}

export interface GraphSessionState {
    initialized: boolean;
    sessionScoped: true;
    lastUpdatedAt: string | null;
    nodes: Record<string, SessionNodeState>;
    connections: Record<string, SessionConnectionState>;
}

export function createEmptyGraphSessionState(): GraphSessionState {
    return {
        initialized: false,
        sessionScoped: true,
        lastUpdatedAt: null,
        nodes: {},
        connections: {},
    };
}

export function applyGraphMutationToState(
    state: GraphSessionState,
    type: string,
    payload: unknown,
): void {
    const mutationPayload =
        typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)
            : null;

    if (!mutationPayload) {
        return;
    }

    switch (type) {
        case MUTATION_TYPES.addNode: {
            const nodeId = getString(mutationPayload, 'nodeId');
            if (!nodeId) {
                return;
            }
            const existing = state.nodes[nodeId] ?? { nodeId };
            state.nodes[nodeId] = {
                ...existing,
                ...mutationPayload,
                nodeId,
                properties: mergeProperties(existing.properties, mutationPayload),
            };
            touch(state);
            return;
        }
        case MUTATION_TYPES.moveNode: {
            const nodeId = getString(mutationPayload, 'nodeId');
            if (!nodeId) {
                return;
            }
            const existing = state.nodes[nodeId] ?? { nodeId };
            state.nodes[nodeId] = {
                ...existing,
                nodeId,
                x: getNumberOrExisting(mutationPayload, 'x', existing.x),
                y: getNumberOrExisting(mutationPayload, 'y', existing.y),
            };
            touch(state);
            return;
        }
        case MUTATION_TYPES.updateNodeProperties: {
            const nodeId = getString(mutationPayload, 'nodeId');
            if (!nodeId) {
                return;
            }
            const existing = state.nodes[nodeId] ?? { nodeId };
            state.nodes[nodeId] = {
                ...existing,
                nodeId,
                properties: mergeProperties(existing.properties, mutationPayload),
            };
            touch(state);
            return;
        }
        case MUTATION_TYPES.updateNodeProperty: {
            const nodeId = getString(mutationPayload, 'nodeId');
            const key = getString(mutationPayload, 'key');
            if (!nodeId || !key) {
                return;
            }
            const existing = state.nodes[nodeId] ?? { nodeId };
            const properties = { ...(existing.properties ?? {}) };
            properties[key] = mutationPayload.value;
            state.nodes[nodeId] = {
                ...existing,
                nodeId,
                properties,
            };
            touch(state);
            return;
        }
        case MUTATION_TYPES.deleteNode: {
            const nodeId = getString(mutationPayload, 'nodeId');
            if (!nodeId) {
                return;
            }
            delete state.nodes[nodeId];
            for (const [connectionId, connection] of Object.entries(
                state.connections,
            )) {
                if (
                    connection.fromNodeId === nodeId ||
                    connection.toNodeId === nodeId
                ) {
                    delete state.connections[connectionId];
                }
            }
            touch(state);
            return;
        }
        case MUTATION_TYPES.addConnection: {
            const connection = toConnectionState(mutationPayload);
            if (!connection) {
                return;
            }
            state.connections[connection.id] = connection;
            touch(state);
            return;
        }
        case MUTATION_TYPES.deleteConnection: {
            const connectionId =
                getString(mutationPayload, 'connectionId') ??
                findConnectionIdByEndpoints(state, mutationPayload);
            if (!connectionId) {
                return;
            }
            delete state.connections[connectionId];
            touch(state);
            return;
        }
        default:
            return;
    }
}

function touch(state: GraphSessionState): void {
    state.lastUpdatedAt = new Date().toISOString();
}

function getString(
    source: Record<string, unknown>,
    key: string,
): string | null {
    const value = source[key];
    return typeof value === 'string' && value.trim().length > 0
        ? value
        : null;
}

function getNumberOrExisting(
    source: Record<string, unknown>,
    key: string,
    fallback: number | undefined,
): number | undefined {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    return fallback;
}

function mergeProperties(
    current: Record<string, unknown> | undefined,
    payload: Record<string, unknown>,
): Record<string, unknown> | undefined {
    const properties = payload.properties;
    if (typeof properties !== 'object' || properties === null) {
        return current;
    }
    return {
        ...(current ?? {}),
        ...(properties as Record<string, unknown>),
    };
}

function toConnectionState(
    payload: Record<string, unknown>,
): SessionConnectionState | null {
    const id = getString(payload, 'connectionId') ?? makeConnectionId(payload);
    const fromNodeId = getString(payload, 'fromNodeId');
    const fromPort = getString(payload, 'fromPort');
    const toNodeId = getString(payload, 'toNodeId');
    const toPort = getString(payload, 'toPort');

    if (!id || !fromNodeId || !fromPort || !toNodeId || !toPort) {
        return null;
    }

    return {
        ...payload,
        id,
        fromNodeId,
        fromPort,
        toNodeId,
        toPort,
    };
}

function makeConnectionId(payload: Record<string, unknown>): string | null {
    const fromNodeId = getString(payload, 'fromNodeId');
    const fromPort = getString(payload, 'fromPort');
    const toNodeId = getString(payload, 'toNodeId');
    const toPort = getString(payload, 'toPort');

    if (!fromNodeId || !fromPort || !toNodeId || !toPort) {
        return null;
    }

    return `${fromNodeId}:${fromPort}->${toNodeId}:${toPort}`;
}

function findConnectionIdByEndpoints(
    state: GraphSessionState,
    payload: Record<string, unknown>,
): string | null {
    const fromNodeId = getString(payload, 'fromNodeId');
    const fromPort = getString(payload, 'fromPort');
    const toNodeId = getString(payload, 'toNodeId');
    const toPort = getString(payload, 'toPort');

    if (!fromNodeId || !fromPort || !toNodeId || !toPort) {
        return null;
    }

    const matched = Object.entries(state.connections).find(
        ([, connection]) =>
            connection.fromNodeId === fromNodeId &&
            connection.fromPort === fromPort &&
            connection.toNodeId === toNodeId &&
            connection.toPort === toPort,
    );

    return matched?.[0] ?? null;
}
