import test from 'node:test';
import assert from 'node:assert/strict';
import { withMitigation } from '../mcp/errorMitigations.js';

test('adds token mitigation for expired token-like errors', () => {
    const message = withMitigation(
        'join_project',
        'Invalid or expired collaboration token.',
    );
    assert.match(message, /Generate a new collaboration token/i);
    assert.match(message, /15 minutes/i);
});

test('adds websocket mode mitigation for mode mismatch errors', () => {
    const message = withMitigation(
        'join_project',
        'MCP requires websocket mode (server-backed).',
    );
    assert.match(message, /Switch project collaboration mode to websocket/i);
});

test('falls back to generic mitigation when no pattern matches', () => {
    const message = withMitigation('add_node', 'Some unknown error');
    assert.match(message, /Retry after join_project/i);
});
