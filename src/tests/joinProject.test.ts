import test from 'node:test';
import assert from 'node:assert/strict';
import { joinProjectTool } from '../mcp/tools/joinProject.js';

class FakeRuntime {
    public joinInput: { endpoint: string; token: string } | null = null;
    public cursorIdentity: {
        actorId?: string | null;
        actorType?: string | null;
        displayName?: string | null;
    } | null = null;

    async joinSession(input: { endpoint: string; token: string }): Promise<{
        projectId: string;
        mode: 'webrtc' | 'websocket';
        role: 'owner' | 'editor' | 'viewer';
    }> {
        this.joinInput = input;
        return {
            projectId: '42',
            mode: 'websocket',
            role: 'editor',
        };
    }

    setCursorIdentity(identity: {
        actorId?: string | null;
        actorType?: string | null;
        displayName?: string | null;
    }): void {
        this.cursorIdentity = identity;
    }
}

function buildToken(claims: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }))
        .toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${header}.${payload}.signature`;
}

test('join_project uses explicit endpoint and token-only join flow', async () => {
    const runtime = new FakeRuntime();
    const token = buildToken({
        projectId: 42,
        actorId: 'agent-1',
        actorType: 'agent',
        displayName: 'Automation Agent',
        role: 'editor',
        scopes: ['collab:read', 'collab:write', 'collab:cursor'],
        exp: Math.floor(Date.now() / 1000) + 60,
    });

    const result = await joinProjectTool(runtime as never, {
        token,
        endpoint: 'wss://api.nodl.dev/collaboration',
    });

    assert.equal(runtime.joinInput?.endpoint, 'wss://api.nodl.dev/collaboration');
    assert.equal(runtime.joinInput?.token, token);
    assert.equal(
        (result as { endpointUsed: string }).endpointUsed,
        'wss://api.nodl.dev/collaboration',
    );
    const session = (result as { session: Record<string, unknown> }).session;
    assert.deepEqual(session.snapshotSummary, {
        nodeCount: 0,
        connectionCount: 0,
    });
    assert.equal(Object.prototype.hasOwnProperty.call(session, 'snapshot'), false);
    assert.equal(runtime.cursorIdentity?.displayName, 'Automation Agent');
});

test('join_project falls back to env endpoint then local dev endpoint', async () => {
    const runtime = new FakeRuntime();
    const originalNodlEndpoint = process.env.NODL_COLLAB_ENDPOINT;
    const originalCollabWs = process.env.COLLAB_SECURE_WS_URL;
    const token = buildToken({
        projectId: 7,
        exp: Math.floor(Date.now() / 1000) + 60,
    });

    process.env.NODL_COLLAB_ENDPOINT = '';
    process.env.COLLAB_SECURE_WS_URL = 'ws://localhost:3000/collaboration';
    await joinProjectTool(runtime as never, { token });
    assert.equal(runtime.joinInput?.endpoint, 'ws://localhost:3000/collaboration');

    delete process.env.NODL_COLLAB_ENDPOINT;
    delete process.env.COLLAB_SECURE_WS_URL;
    await joinProjectTool(runtime as never, { token });
    assert.equal(runtime.joinInput?.endpoint, 'ws://localhost:3000/collaboration');

    if (originalNodlEndpoint === undefined) {
        delete process.env.NODL_COLLAB_ENDPOINT;
    } else {
        process.env.NODL_COLLAB_ENDPOINT = originalNodlEndpoint;
    }
    if (originalCollabWs === undefined) {
        delete process.env.COLLAB_SECURE_WS_URL;
    } else {
        process.env.COLLAB_SECURE_WS_URL = originalCollabWs;
    }
});

test('join_project fails when token has no projectId claim', async () => {
    const runtime = new FakeRuntime();
    const token = buildToken({
        actorId: 'agent-1',
        exp: Math.floor(Date.now() / 1000) + 60,
    });

    await assert.rejects(
        joinProjectTool(runtime as never, { token }),
        /Token is missing projectId claim/,
    );
});
