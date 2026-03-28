import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addNodeTool,
    connectNodesTool,
    describeCurrentNodesTool,
    describeNodePropertiesTool,
    editNodePropertiesTool,
    listCurrentNodesTool,
    listNodesTool,
    moveCursorTool,
} from '../mcp/tools/graphTools.js';
import {
    createEmptyGraphSessionState,
    GraphSessionState,
} from '../runtime/state/graphSessionState.js';

class FakeRuntime {
    public state: GraphSessionState = createEmptyGraphSessionState();
    public lastMutation: { type: string; payload: unknown } | null = null;
    public cursorPayload: unknown = null;

    constructor() {
        this.state.initialized = true;
    }

    async applyMutation(type: string, payload: unknown): Promise<{ ok: boolean }> {
        this.lastMutation = { type, payload };
        return { ok: true };
    }

    async moveCursor(payload: Record<string, unknown>): Promise<{ ok: boolean }> {
        this.cursorPayload = payload;
        return { ok: true };
    }

    getGraphSessionState(): GraphSessionState {
        return structuredClone(this.state);
    }

    async refreshSessionSnapshot(): Promise<void> {
        // no-op for unit tests
    }
}

test('add_node validates required fields', async () => {
    const runtime = new FakeRuntime();

    await assert.rejects(
        addNodeTool(runtime as never, {
            nodeId: 'n1',
            nodeType: '',
            position: { x: 0, y: 0 },
        }),
        /nodeType/,
    );
});

test('connect_nodes rejects incompatible ports', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.source = {
        nodeId: 'source',
        nodeType: 'noise',
    };
    runtime.state.nodes.target = {
        nodeId: 'target',
        nodeType: 'math',
    };

    await assert.rejects(
        connectNodesTool(runtime as never, {
            fromNodeId: 'source',
            fromPort: 'Texture',
            toNodeId: 'target',
            toPort: 'Input',
        }),
        /Port type mismatch/,
    );
});

test('connect_nodes accepts compatible ports and maps to addConnection', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.source = {
        nodeId: 'source',
        nodeType: 'noise',
    };
    runtime.state.nodes.target = {
        nodeId: 'target',
        nodeType: 'layout',
    };

    const result = await connectNodesTool(runtime as never, {
        fromNodeId: 'source',
        fromPort: 'Texture',
        toNodeId: 'target',
        toPort: 'Texture 1',
    });

    assert.deepEqual(result, { ok: true, reason: null });
    assert.equal(runtime.lastMutation?.type, 'addConnection');
});

test('connect_nodes accepts node type fallback from "type" field', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.source = {
        nodeId: 'source',
        type: 'noise',
    };
    runtime.state.nodes.target = {
        nodeId: 'target',
        type: 'layout',
    };

    const result = await connectNodesTool(runtime as never, {
        fromNodeId: 'source',
        fromPort: 'Texture',
        toNodeId: 'target',
        toPort: 'Texture 1',
    });

    assert.deepEqual(result, { ok: true, reason: null });
    assert.equal(runtime.lastMutation?.type, 'addConnection');
});

test('list_current_nodes is session-scoped', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.n1 = { nodeId: 'n1', nodeType: 'noise' };

    const response = await listCurrentNodesTool(runtime as never);

    assert.equal(response.sessionScoped, true);
    assert.equal(response.initialized, true);
    assert.equal(response.counts.nodes, 1);
    assert.ok(response.nodeIdsPreview.includes('n1'));
    assert.equal(typeof response.nodes, 'undefined');
});

test('list_current_nodes returns full state when requested', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.n1 = { nodeId: 'n1', nodeType: 'noise' };

    const response = await listCurrentNodesTool(runtime as never, {
        includeFullState: true,
    });

    assert.ok(response.nodes?.n1);
});

test('describe_current_nodes returns focused diagnostics for requested ids', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.edge1 = {
        nodeId: 'edge1',
        type: 'edge',
        x: 10,
        y: 20,
        properties: {
            threshold: { value: 0.5 },
        },
    };

    const response = await describeCurrentNodesTool(runtime as never, {
        nodeIds: ['edge1', 'missing'],
    });

    const nodes = response.nodes as Array<Record<string, unknown>>;
    const edge = nodes.find((node) => node.nodeId === 'edge1');
    const missing = nodes.find((node) => node.nodeId === 'missing');
    assert.ok(edge);
    assert.equal(edge?.exists, true);
    assert.equal(edge?.nodeType, 'edge');
    assert.equal(edge?.typeField, 'edge');
    assert.ok(Array.isArray(edge?.propertyKeys));
    assert.ok(missing);
    assert.equal(missing?.exists, false);
});

test('move_cursor maps to collaboration cursor event payload', async () => {
    const runtime = new FakeRuntime();

    const response = await moveCursorTool(runtime as never, {
        x: 15,
        y: 25,
    });

    assert.deepEqual(response, { ok: true, reason: null });
    assert.deepEqual(runtime.cursorPayload, { x: 15, y: 25 });
});

test('list_nodes applies limit and returns lightweight summary by default', async () => {
    const response = await listNodesTool({ query: 'noise', limit: 5 });
    assert.ok(Array.isArray(response.nodes));
    assert.ok(response.nodes.length <= 5);

    const first = response.nodes[0] as Record<string, unknown> | undefined;
    if (first) {
        assert.equal(typeof first.nodeType, 'string');
        assert.equal(Object.prototype.hasOwnProperty.call(first, 'inputs'), false);
        assert.equal(
            Object.prototype.hasOwnProperty.call(first, 'properties'),
            false,
        );
    }
});

test('describe_node_properties returns allowed schema and current values', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.noise1 = {
        nodeId: 'noise1',
        nodeType: 'noise',
        properties: {
            type: { value: 'Perlin 3D', mode: 'value' },
            seed: { value: 666, mode: 'value' },
        },
    };

    const response = await describeNodePropertiesTool(runtime as never, {
        nodeId: 'noise1',
    });

    assert.equal(response.nodeId, 'noise1');
    assert.equal(response.nodeType, 'noise');
    const properties = response.properties as Array<Record<string, unknown>>;
    const typeProp = properties.find((p) => p.key === 'type');
    const seedProp = properties.find((p) => p.key === 'seed');

    assert.ok(typeProp);
    assert.equal(typeProp?.currentValue, 'Perlin 3D');
    assert.ok(Array.isArray(typeProp?.options));
    assert.ok(seedProp);
    assert.equal(seedProp?.currentValue, 666);
});

test('describe_node_properties returns runtime keys for display-named properties', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.dither1 = {
        nodeId: 'dither1',
        nodeType: 'dither',
        properties: {
            colorA: {
                name: 'Color A',
                type: 'vector4',
                value: { x: 0, y: 0, z: 0, w: 1 },
            },
            colorMode: {
                name: 'colorMode',
                type: 'select',
                options: ['Inherit', 'Custom'],
                value: 'Custom',
            },
        },
    };

    const response = await describeNodePropertiesTool(runtime as never, {
        nodeId: 'dither1',
    });

    const properties = response.properties as Array<Record<string, unknown>>;
    assert.ok(properties.some((p) => p.key === 'colorA'));
    assert.ok(properties.some((p) => p.key === 'colorMode'));
    assert.equal(properties.some((p) => p.key === 'Color A'), false);
});

test('edit_node_properties accepts normalized property names and vector aliases', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.noise2 = {
        nodeId: 'noise2',
        nodeType: 'noise',
        properties: {
            colorA: {
                name: 'Color A',
                type: 'vector4',
                min: 0,
                max: 1,
                value: { x: 0, y: 0, z: 0, w: 1 },
            },
        },
    };

    const response = await editNodePropertiesTool(runtime as never, {
        nodeId: 'noise2',
        properties: {
            colorA: { r: 1, g: 0, b: 0, a: 1 },
        },
    });

    assert.deepEqual(response, { ok: true, reason: null });
    assert.equal(runtime.lastMutation?.type, 'updateNodeProperties');
    const payload = runtime.lastMutation?.payload as Record<string, unknown>;
    const props = payload.properties as Record<string, unknown>;
    assert.ok(props.colorA);
    assert.deepEqual(props.colorA, { x: 1, y: 0, z: 0, w: 1 });
});

test('edit_node_properties rejects out-of-range vector component values', async () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.noise2 = {
        nodeId: 'noise2',
        nodeType: 'noise',
        properties: {
            colorA: {
                name: 'Color A',
                type: 'vector4',
                min: 0,
                max: 1,
                value: { x: 0, y: 0, z: 0, w: 1 },
            },
        },
    };

    await assert.rejects(
        editNodePropertiesTool(runtime as never, {
            nodeId: 'noise2',
            properties: {
                colorA: { x: 2, y: 0, z: 0, w: 1 },
            },
        }),
        /must be <= 1/,
    );
});
