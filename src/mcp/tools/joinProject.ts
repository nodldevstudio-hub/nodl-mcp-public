import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';
import {
    assertTokenProjectMatch,
    resolveToken,
} from '../auth/tokenResolver.js';

export interface JoinProjectArgs {
    projectId: string;
    token: string;
    endpoint?: string;
    displayName?: string;
}

export async function joinProjectTool(
    runtime: CollaborationRuntime,
    args: JoinProjectArgs,
): Promise<Record<string, unknown>> {
    const endpoint = resolveEndpoint(args.endpoint);
    const resolvedToken = resolveToken(args.token, { requireNotExpired: true });
    assertTokenProjectMatch(resolvedToken.claims.projectId, args.projectId);

    const joinResult = await runtime.joinSession({
        endpoint,
        projectId: args.projectId,
        token: args.token,
    });

    const displayName =
        typeof args.displayName === 'string' && args.displayName.trim().length > 0
            ? args.displayName.trim()
            : resolvedToken.claims.displayName ?? null;

    runtime.setCursorIdentity({
        actorId: resolvedToken.claims.actorId ?? null,
        actorType: resolvedToken.claims.actorType ?? null,
        displayName,
    });

    return {
        ok: true,
        endpointUsed: endpoint,
        session: joinResult,
        token: {
            actorType: resolvedToken.claims.actorType ?? null,
            actorId: resolvedToken.claims.actorId ?? null,
            displayName,
            role: resolvedToken.claims.role ?? null,
            scopes: resolvedToken.claims.scopes ?? [],
            projectId: resolvedToken.claims.projectId ?? null,
            expiration: resolvedToken.expiration,
        },
        security: {
            tokenStoredOnDisk: false,
            note: 'Token is only held in memory for the active MCP process.',
        },
    };
}

function resolveEndpoint(explicitEndpoint?: string): string {
    const envEndpointCandidates = [
        process.env.NODL_COLLAB_ENDPOINT,
        process.env.COLLAB_SECURE_WS_URL,
        process.env.NODL_REALTIME_ENDPOINT,
    ];

    const firstEnvEndpoint = envEndpointCandidates.find(
        (candidate) => typeof candidate === 'string' && candidate.trim().length > 0,
    );

    return (
        explicitEndpoint ??
        firstEnvEndpoint ??
        'ws://localhost:1235/collaboration'
    );
}
