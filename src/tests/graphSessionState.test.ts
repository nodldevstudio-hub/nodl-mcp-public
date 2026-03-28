import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyGraphMutationToState,
    createEmptyGraphSessionState,
} from '../runtime/state/graphSessionState.js';

test('graph session reducer applies node and connection mutations', () => {
    const state = createEmptyGraphSessionState();
    state.initialized = true;

    applyGraphMutationToState(state, 'addNode', {
        nodeId: 'node-a',
        nodeType: 'noise',
        x: 10,
        y: 20,
    });

    assert.equal(state.nodes['node-a']?.nodeType, 'noise');
    assert.equal(state.nodes['node-a']?.x, 10);
    assert.equal(state.nodes['node-a']?.y, 20);

    applyGraphMutationToState(state, 'moveNode', {
        nodeId: 'node-a',
        x: 42,
        y: 84,
    });

    assert.equal(state.nodes['node-a']?.x, 42);
    assert.equal(state.nodes['node-a']?.y, 84);

    applyGraphMutationToState(state, 'updateNodeProperties', {
        nodeId: 'node-a',
        properties: {
            seed: 123,
        },
    });

    assert.deepEqual(state.nodes['node-a']?.properties, { seed: 123 });

    applyGraphMutationToState(state, 'addConnection', {
        connectionId: 'c-1',
        fromNodeId: 'node-a',
        fromPort: 'Texture',
        toNodeId: 'node-b',
        toPort: 'Texture 1',
    });

    assert.equal(state.connections['c-1']?.fromPort, 'Texture');

    applyGraphMutationToState(state, 'deleteConnection', {
        connectionId: 'c-1',
    });

    assert.equal(state.connections['c-1'], undefined);

    applyGraphMutationToState(state, 'deleteNode', {
        nodeId: 'node-a',
    });

    assert.equal(state.nodes['node-a'], undefined);
    assert.notEqual(state.lastUpdatedAt, null);
});

test('graph session reducer merges incoming and outgoing payload formats', () => {
    const state = createEmptyGraphSessionState();

    applyGraphMutationToState(state, 'addConnection', {
        fromNodeId: 'a',
        fromPort: 'out',
        toNodeId: 'b',
        toPort: 'in',
    });

    const key = 'a:out->b:in';
    assert.ok(state.connections[key]);

    applyGraphMutationToState(state, 'deleteConnection', {
        fromNodeId: 'a',
        fromPort: 'out',
        toNodeId: 'b',
        toPort: 'in',
    });

    assert.equal(state.connections[key], undefined);
});
