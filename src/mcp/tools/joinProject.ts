import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';
import {
    assertTokenProjectMatch,
    resolveToken,
} from '../auth/tokenResolver.js';

export interface JoinProjectArgs {
    projectId: string;
    token: string;
    endpoint?: string;
}

export async function joinProjectTool(
    runtime: CollaborationRuntime,
    args: JoinProjectArgs,
): Promise<Record<string, unknown>> {
    const endpoint = args.endpoint ?? 'wss://realtime.nodl.dev';
    const resolvedToken = resolveToken(args.token, { requireNotExpired: true });
    assertTokenProjectMatch(resolvedToken.claims.projectId, args.projectId);

    const joinResult = await runtime.joinSession({
        endpoint,
        projectId: args.projectId,
        token: args.token,
    });

    return {
        ok: true,
        session: joinResult,
        token: {
            actorType: resolvedToken.claims.actorType ?? null,
            actorId: resolvedToken.claims.actorId ?? null,
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
