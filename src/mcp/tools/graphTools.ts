import {
    findNodeCatalogEntry,
    findPort,
    isConnectionTypeCompatible,
} from '../catalog/typeCompatibility.js';
import {
    loadNodeCatalog,
    NodeMetadataEntry,
    NodePropertyMetadata,
} from '../catalog/nodeCatalog.js';
import { MUTATION_TYPES } from '../constants/mutationTypes.js';
import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';

export interface ListNodesResult {
    nodes: unknown[];
}

export interface ListNodesArgs {
    query?: string;
    limit?: number;
    includePorts?: boolean;
    includeProperties?: boolean;
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

export interface DescribeNodePropertiesArgs {
    nodeId: string;
}

export async function listNodesTool(args?: ListNodesArgs): Promise<ListNodesResult> {
    const catalog = await loadNodeCatalog();
    const query =
        typeof args?.query === 'string' && args.query.trim().length > 0
            ? args.query.trim().toLowerCase()
            : null;
    const requestedLimit =
        typeof args?.limit === 'number' && Number.isFinite(args.limit)
            ? Math.floor(args.limit)
            : 40;
    const limit = Math.min(Math.max(requestedLimit, 1), 200);
    const includePorts = args?.includePorts === true;
    const includeProperties = args?.includeProperties === true;

    const filtered = query
        ? catalog.filter((entry) => {
              const nodeType = String(entry.type ?? '').toLowerCase();
              const category = String(entry.category ?? '').toLowerCase();
              const displayName = String(entry.displayName ?? '').toLowerCase();
              return (
                  nodeType.includes(query) ||
                  category.includes(query) ||
                  displayName.includes(query)
              );
          })
        : catalog;

    const nodes = filtered.slice(0, limit).map((entry: NodeMetadataEntry) => {
        const result: Record<string, unknown> = {
            nodeType: entry.type ?? null,
            displayName: entry.displayName ?? null,
            category: entry.category ?? null,
            tags: entry.tags ?? [],
        };
        if (includePorts) {
            result.inputs = entry.inputs ?? [];
            result.outputs = entry.outputs ?? [];
        }
        if (includeProperties) {
            result.properties = entry.properties ?? [];
        }
        return result;
    });

    return { nodes };
}

export async function listCurrentNodesTool(
    runtime: CollaborationRuntime,
): Promise<ListCurrentNodesResult> {
    await syncRuntimeSnapshot(runtime);
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
    await syncRuntimeSnapshot(runtime);
    assertNonEmptyString(args.nodeId, 'nodeId');
    assertNonEmptyObject(args.properties, 'properties');
    const normalizedProperties = await normalizeAndValidateNodeProperties(
        runtime,
        args.nodeId,
        args.properties
    );

    const result = await runtime.applyMutation(
        MUTATION_TYPES.updateNodeProperties,
        {
            nodeId: args.nodeId,
            properties: normalizedProperties,
        },
    );

    return formatAck(result);
}

export async function describeNodePropertiesTool(
    runtime: CollaborationRuntime,
    args: DescribeNodePropertiesArgs,
): Promise<Record<string, unknown>> {
    await syncRuntimeSnapshot(runtime);
    assertNonEmptyString(args.nodeId, 'nodeId');

    const state = runtime.getGraphSessionState();
    const targetNode = state.nodes[args.nodeId] as Record<string, unknown> | undefined;
    if (!targetNode) {
        throw new Error(
            `describe_node_properties requires node '${args.nodeId}' to exist in current session state.`,
        );
    }

    const nodeType =
        (typeof targetNode.nodeType === 'string' && targetNode.nodeType) ||
        (typeof targetNode.type === 'string' && targetNode.type) ||
        null;

    if (!nodeType) {
        throw new Error(`Cannot resolve node type for node '${args.nodeId}'.`);
    }

    const catalog = await loadNodeCatalog();
    const nodeMeta = findNodeCatalogEntry(catalog, nodeType);
    if (!nodeMeta) {
        throw new Error(`Unknown node type in catalog: ${nodeType}`);
    }

    const currentProperties =
        targetNode.properties && typeof targetNode.properties === 'object'
            ? (targetNode.properties as Record<string, unknown>)
            : {};

    const properties = (nodeMeta.properties ?? []).map((prop) => {
        const currentRaw = currentProperties[prop.name];
        const currentObj =
            currentRaw && typeof currentRaw === 'object'
                ? (currentRaw as Record<string, unknown>)
                : null;
        const currentValue =
            currentObj && Object.prototype.hasOwnProperty.call(currentObj, 'value')
                ? currentObj.value
                : currentRaw;
        const currentMode =
            currentObj && typeof currentObj.mode === 'string'
                ? currentObj.mode
                : undefined;

        return {
            name: prop.name,
            type: prop.type ?? null,
            category: prop.category ?? null,
            options: Array.isArray(prop.options) ? prop.options : [],
            min: typeof prop.min === 'number' ? prop.min : null,
            max: typeof prop.max === 'number' ? prop.max : null,
            defaultValue:
                typeof prop.defaultValue === 'undefined' ? null : prop.defaultValue,
            currentValue: typeof currentValue === 'undefined' ? null : currentValue,
            ...(currentMode ? { currentMode } : {}),
        };
    });

    return {
        nodeId: args.nodeId,
        nodeType,
        propertyCount: properties.length,
        properties,
    };
}

export async function connectNodesTool(
    runtime: CollaborationRuntime,
    args: ConnectNodesArgs,
): Promise<Record<string, unknown>> {
    await syncRuntimeSnapshot(runtime);
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
    await syncRuntimeSnapshot(runtime);
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

async function syncRuntimeSnapshot(runtime: CollaborationRuntime): Promise<void> {
    try {
        await runtime.refreshSessionSnapshot();
    } catch {
        // best-effort sync; local cache remains usable when snapshot refresh is unavailable
    }
}

async function normalizeAndValidateNodeProperties(
    runtime: CollaborationRuntime,
    nodeId: string,
    properties: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const state = runtime.getGraphSessionState();
    const targetNode = state.nodes[nodeId] as Record<string, unknown> | undefined;
    if (!targetNode) {
        throw new Error(
            `edit_node_properties requires node '${nodeId}' to exist in current session state.`,
        );
    }

    const nodeType =
        (typeof targetNode.nodeType === 'string' && targetNode.nodeType) ||
        (typeof targetNode.type === 'string' && targetNode.type) ||
        null;

    if (!nodeType) {
        throw new Error(
            `Cannot resolve node type for node '${nodeId}'.`,
        );
    }

    const catalog = await loadNodeCatalog();
    const nodeMeta = findNodeCatalogEntry(catalog, nodeType);
    if (!nodeMeta) {
        throw new Error(`Unknown node type in catalog: ${nodeType}`);
    }

    const normalized: Record<string, unknown> = {};
    const availableProps = nodeMeta.properties ?? [];
    for (const [requestedKey, rawValue] of Object.entries(properties)) {
        const propertyMeta =
            availableProps.find((prop) => prop.name === requestedKey) ??
            availableProps.find(
                (prop) => prop.name.toLowerCase() === requestedKey.toLowerCase()
            ) ??
            availableProps.find(
                (prop) =>
                    normalizePropertyKey(prop.name) ===
                    normalizePropertyKey(requestedKey)
            );

        if (!propertyMeta) {
            throw new Error(
                `Unknown property '${requestedKey}' for node type '${nodeType}'.`,
            );
        }

        normalized[propertyMeta.name] = coerceAndValidatePropertyValue(
            propertyMeta,
            rawValue,
            nodeType,
        );
    }

    return normalized;
}

function coerceAndValidatePropertyValue(
    property: NodePropertyMetadata,
    rawValue: unknown,
    nodeType: string
): unknown {
    const propertyType = (property.type ?? '').toLowerCase();

    if (propertyType === 'number') {
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: expected a finite number.`,
            );
        }
        if (typeof property.min === 'number' && rawValue < property.min) {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: must be >= ${property.min}.`,
            );
        }
        if (typeof property.max === 'number' && rawValue > property.max) {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: must be <= ${property.max}.`,
            );
        }
        return rawValue;
    }

    if (propertyType === 'boolean') {
        if (typeof rawValue !== 'boolean') {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: expected a boolean.`,
            );
        }
        return rawValue;
    }

    if (propertyType === 'select') {
        if (typeof rawValue !== 'string') {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: expected a string option.`,
            );
        }

        const options = Array.isArray(property.options)
            ? property.options.filter((option): option is string => typeof option === 'string')
            : [];

        if (options.length === 0) {
            return rawValue;
        }

        const exact = options.find((option) => option === rawValue);
        if (exact) {
            return exact;
        }

        const caseInsensitive = options.find(
            (option) => option.toLowerCase() === rawValue.toLowerCase()
        );
        if (caseInsensitive) {
            return caseInsensitive;
        }

        throw new Error(
            `Invalid option for ${nodeType}.${property.name}: '${rawValue}'. Allowed: ${options.join(', ')}.`,
        );
    }

    const vectorMatch = propertyType.match(/^vector([234])$/);
    if (vectorMatch) {
        const dimensions = Number(vectorMatch[1]);
        return coerceVectorValue(rawValue, dimensions, property, nodeType);
    }

    return rawValue;
}

function normalizePropertyKey(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function coerceVectorValue(
    rawValue: unknown,
    dimensions: number,
    property: NodePropertyMetadata,
    nodeType: string
): Record<string, number> {
    const keys = ['x', 'y', 'z', 'w'].slice(0, dimensions);

    let values: number[] | null = null;
    if (Array.isArray(rawValue)) {
        if (rawValue.length !== dimensions) {
            throw new Error(
                `Invalid value for ${nodeType}.${property.name}: expected array of length ${dimensions}.`,
            );
        }
        values = rawValue.map((v) => {
            if (typeof v !== 'number' || !Number.isFinite(v)) {
                throw new Error(
                    `Invalid value for ${nodeType}.${property.name}: vector components must be finite numbers.`,
                );
            }
            return v;
        });
    } else if (rawValue && typeof rawValue === 'object') {
        const source = rawValue as Record<string, unknown>;
        const aliases: Record<string, string[]> = {
            x: ['x', 'r'],
            y: ['y', 'g'],
            z: ['z', 'b'],
            w: ['w', 'a'],
        };
        values = keys.map((key) => {
            const aliasList = aliases[key] ?? [key];
            let component: unknown = undefined;
            for (const alias of aliasList) {
                if (Object.prototype.hasOwnProperty.call(source, alias)) {
                    component = source[alias];
                    break;
                }
            }
            if (typeof component !== 'number' || !Number.isFinite(component)) {
                throw new Error(
                    `Invalid value for ${nodeType}.${property.name}: missing/invalid component '${key}'.`,
                );
            }
            return component;
        });
    }

    if (!values) {
        throw new Error(
            `Invalid value for ${nodeType}.${property.name}: expected vector${dimensions} object or array.`,
        );
    }

    const min = typeof property.min === 'number' ? property.min : null;
    const max = typeof property.max === 'number' ? property.max : null;
    if (min !== null || max !== null) {
        values.forEach((value, index) => {
            if (min !== null && value < min) {
                throw new Error(
                    `Invalid value for ${nodeType}.${property.name}: component '${keys[index]}' must be >= ${min}.`,
                );
            }
            if (max !== null && value > max) {
                throw new Error(
                    `Invalid value for ${nodeType}.${property.name}: component '${keys[index]}' must be <= ${max}.`,
                );
            }
        });
    }

    const vector: Record<string, number> = {};
    keys.forEach((key, index) => {
        vector[key] = values?.[index] ?? 0;
    });
    return vector;
}
