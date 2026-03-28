import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';
import { decodeTokenPayload, tokenExpirationStatus } from './tokenUtils.js';

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
    const tokenPayload = decodeTokenPayload(args.token);
    const expiry = tokenExpirationStatus(args.token);

    const joinResult = await runtime.joinSession({
        endpoint,
        projectId: args.projectId,
        token: args.token,
    });

    return {
        ok: true,
        session: joinResult,
        token: {
            actorType: tokenPayload.actorType ?? null,
            actorId: tokenPayload.actorId ?? null,
            role: tokenPayload.role ?? null,
            scopes: tokenPayload.scopes ?? [],
            projectId: tokenPayload.projectId ?? null,
            expiration: expiry,
        },
        security: {
            tokenStoredOnDisk: false,
            note: 'Token is only held in memory for the active MCP process.',
        },
    };
}
