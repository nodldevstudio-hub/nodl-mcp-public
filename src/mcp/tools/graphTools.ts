import {
    findNodeCatalogEntry,
    findPort,
    isConnectionTypeCompatible,
} from '../catalog/typeCompatibility.js';
import { loadNodeCatalog } from '../catalog/nodeCatalog.js';
import { MUTATION_TYPES } from '../constants/mutationTypes.js';
import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';

export interface ListNodesResult {
    nodes: unknown[];
}

export interface ListCurrentNodesResult {
    initialized: boolean;
    sessionScoped: true;
    lastUpdatedAt: string | null;
    nodes: Record<string, unknown>;
    connections: Record<string, unknown>;
}

export interface AddNodeArgs {
    nodeId: string;
    nodeType: string;
    position: {
        x: number;
        y: number;
    };
    properties?: Record<string, unknown>;
}

export interface RemoveNodeArgs {
    nodeId: string;
}

export interface MoveNodeArgs {
    nodeId: string;
    x: number;
    y: number;
}

export interface EditNodePropertiesArgs {
    nodeId: string;
    properties: Record<string, unknown>;
}

export interface ConnectNodesArgs {
    connectionId?: string;
    fromNodeId: string;
    fromPort: string;
    toNodeId: string;
    toPort: string;
}

export interface DisconnectNodesArgs {
    connectionId?: string;
    fromNodeId?: string;
    fromPort?: string;
    toNodeId?: string;
    toPort?: string;
}

export interface MoveCursorArgs {
    x: number;
    y: number;
    displayName?: string;
}

export async function listNodesTool(): Promise<ListNodesResult> {
    const catalog = await loadNodeCatalog();
    return { nodes: catalog };
}

export function listCurrentNodesTool(
    runtime: CollaborationRuntime,
): ListCurrentNodesResult {
    const state = runtime.getGraphSessionState();
    return {
        initialized: state.initialized,
        sessionScoped: true,
        lastUpdatedAt: state.lastUpdatedAt,
        nodes: state.nodes,
        connections: state.connections,
    };
}

export async function addNodeTool(
    runtime: CollaborationRuntime,
    args: AddNodeArgs,
): Promise<Record<string, unknown>> {
    assertNonEmptyString(args.nodeId, 'nodeId');
    assertNonEmptyString(args.nodeType, 'nodeType');
    assertFiniteNumber(args.position?.x, 'position.x');
    assertFiniteNumber(args.position?.y, 'position.y');

    const result = await runtime.applyMutation(MUTATION_TYPES.addNode, {
        nodeId: args.nodeId,
        nodeType: args.nodeType,
        x: args.position.x,
        y: args.position.y,
        properties: args.properties ?? {},
    });

    return formatAck(result);
}

export async function removeNodeTool(
    runtime: CollaborationRuntime,
    args: RemoveNodeArgs,
): Promise<Record<string, unknown>> {
    assertNonEmptyString(args.nodeId, 'nodeId');
    const result = await runtime.applyMutation(MUTATION_TYPES.deleteNode, {
        nodeId: args.nodeId,
    });
    return formatAck(result);
}

export async function moveNodeTool(
    runtime: CollaborationRuntime,
    args: MoveNodeArgs,
): Promise<Record<string, unknown>> {
    assertNonEmptyString(args.nodeId, 'nodeId');
    assertFiniteNumber(args.x, 'x');
    assertFiniteNumber(args.y, 'y');

    const result = await runtime.applyMutation(MUTATION_TYPES.moveNode, {
        nodeId: args.nodeId,
        x: args.x,
        y: args.y,
    });

    return formatAck(result);
}

export async function editNodePropertiesTool(
    runtime: CollaborationRuntime,
    args: EditNodePropertiesArgs,
): Promise<Record<string, unknown>> {
    assertNonEmptyString(args.nodeId, 'nodeId');
    assertNonEmptyObject(args.properties, 'properties');

    const result = await runtime.applyMutation(
        MUTATION_TYPES.updateNodeProperties,
        {
            nodeId: args.nodeId,
            properties: args.properties,
        },
    );

    return formatAck(result);
}

export async function connectNodesTool(
    runtime: CollaborationRuntime,
    args: ConnectNodesArgs,
): Promise<Record<string, unknown>> {
    assertNonEmptyString(args.fromNodeId, 'fromNodeId');
    assertNonEmptyString(args.fromPort, 'fromPort');
    assertNonEmptyString(args.toNodeId, 'toNodeId');
    assertNonEmptyString(args.toPort, 'toPort');

    const state = runtime.getGraphSessionState();
    const sourceNode = state.nodes[args.fromNodeId] as
        | Record<string, unknown>
        | undefined;
    const targetNode = state.nodes[args.toNodeId] as
        | Record<string, unknown>
        | undefined;

    if (!sourceNode || !targetNode) {
        throw new Error(
            'connect_nodes requires both nodes to exist in current session state.',
        );
    }

    const sourceType =
        typeof sourceNode.nodeType === 'string' ? sourceNode.nodeType : null;
    const targetType =
        typeof targetNode.nodeType === 'string' ? targetNode.nodeType : null;

    if (!sourceType || !targetType) {
        throw new Error(
            'connect_nodes requires source and target nodeType values in session state.',
        );
    }

    const catalog = await loadNodeCatalog();
    const sourceCatalog = findNodeCatalogEntry(catalog, sourceType);
    const targetCatalog = findNodeCatalogEntry(catalog, targetType);

    if (!sourceCatalog) {
        throw new Error(`Unknown source node type in catalog: ${sourceType}`);
    }
    if (!targetCatalog) {
        throw new Error(`Unknown target node type in catalog: ${targetType}`);
    }

    const sourcePort = findPort(sourceCatalog.outputs, args.fromPort);
    const targetPort = findPort(targetCatalog.inputs, args.toPort);

    if (!sourcePort) {
        throw new Error(
            `Unknown source output port '${args.fromPort}' for node type '${sourceType}'.`,
        );
    }
    if (!targetPort) {
        throw new Error(
            `Unknown target input port '${args.toPort}' for node type '${targetType}'.`,
        );
    }

    if (!isConnectionTypeCompatible(sourcePort, targetPort)) {
        throw new Error(
            `Port type mismatch: ${sourceType}.${sourcePort.name} (${sourcePort.type ?? 'unknown'}) -> ${targetType}.${targetPort.name} (${targetPort.type ?? 'unknown'}).`,
        );
    }

    const result = await runtime.applyMutation(MUTATION_TYPES.addConnection, {
        connectionId: args.connectionId,
        fromNodeId: args.fromNodeId,
        fromPort: args.fromPort,
        toNodeId: args.toNodeId,
        toPort: args.toPort,
    });

    return formatAck(result);
}

export async function disconnectNodesTool(
    runtime: CollaborationRuntime,
    args: DisconnectNodesArgs,
): Promise<Record<string, unknown>> {
    const hasConnectionId = typeof args.connectionId === 'string';
    const hasEndpointTuple =
        typeof args.fromNodeId === 'string' &&
        typeof args.fromPort === 'string' &&
        typeof args.toNodeId === 'string' &&
        typeof args.toPort === 'string';

    if (!hasConnectionId && !hasEndpointTuple) {
        throw new Error(
            'disconnect_nodes requires connectionId or full endpoint tuple (fromNodeId, fromPort, toNodeId, toPort).',
        );
    }

    const result = await runtime.applyMutation(MUTATION_TYPES.deleteConnection, {
        connectionId: args.connectionId,
        fromNodeId: args.fromNodeId,
        fromPort: args.fromPort,
        toNodeId: args.toNodeId,
        toPort: args.toPort,
    });

    return formatAck(result);
}

export async function moveCursorTool(
    runtime: CollaborationRuntime,
    args: MoveCursorArgs,
): Promise<Record<string, unknown>> {
    assertFiniteNumber(args.x, 'x');
    assertFiniteNumber(args.y, 'y');

    const result = await runtime.moveCursor({
        x: args.x,
        y: args.y,
        ...(typeof args.displayName === 'string'
            ? { displayName: args.displayName }
            : {}),
    });
    return formatAck(result);
}

function assertNonEmptyString(value: unknown, fieldName: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Invalid or missing string argument: ${fieldName}`);
    }
}

function assertFiniteNumber(value: unknown, fieldName: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Invalid or missing numeric argument: ${fieldName}`);
    }
}

function assertNonEmptyObject(value: unknown, fieldName: string): void {
    if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length === 0
    ) {
        throw new Error(`Invalid or missing object argument: ${fieldName}`);
    }
}

function formatAck(result: { ok: boolean; reason?: string }): Record<string, unknown> {
    return {
        ok: result.ok,
        reason: result.reason ?? null,
    };
}
