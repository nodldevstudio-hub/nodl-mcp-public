import test from 'node:test';
import assert from 'node:assert/strict';
import {
    addNodeTool,
    connectNodesTool,
    listCurrentNodesTool,
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

test('list_current_nodes is session-scoped', () => {
    const runtime = new FakeRuntime();
    runtime.state.nodes.n1 = { nodeId: 'n1', nodeType: 'noise' };

    const response = listCurrentNodesTool(runtime as never);

    assert.equal(response.sessionScoped, true);
    assert.equal(response.initialized, true);
    assert.ok(response.nodes.n1);
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
