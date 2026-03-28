import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';
import {
    resolveToken,
} from '../auth/tokenResolver.js';

export interface JoinProjectArgs {
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
    const tokenProjectId = resolvedToken.claims.projectId;
    if (typeof tokenProjectId !== 'number') {
        throw new Error('Token is missing projectId claim.');
    }

    const joinResult = await runtime.joinSession({
        endpoint,
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
    const normalizedExplicit =
        typeof explicitEndpoint === 'string' && explicitEndpoint.trim().length > 0
            ? explicitEndpoint.trim()
            : undefined;
    const envEndpointCandidates = [
        process.env.NODL_COLLAB_ENDPOINT,
        process.env.COLLAB_SECURE_WS_URL,
    ];

    const firstEnvEndpoint = envEndpointCandidates
        .filter((candidate): candidate is string => typeof candidate === 'string')
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0);

    return (
        normalizedExplicit ??
        firstEnvEndpoint ??
        'ws://localhost:3000/collaboration'
    );
}
