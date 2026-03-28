import { resolveToken } from '../auth/tokenResolver.js';

export interface ListCapabilitiesArgs {
    token: string;
}

export function listCapabilitiesTool(args: ListCapabilitiesArgs): Record<string, unknown> {
    const resolved = resolveToken(args.token);

    return {
        ok: true,
        role: resolved.claims.role ?? null,
        actorType: resolved.claims.actorType ?? null,
        displayName: resolved.claims.displayName ?? null,
        projectId: resolved.claims.projectId ?? null,
        scopes: resolved.claims.scopes ?? [],
        expiration: resolved.expiration,
        note: 'Capabilities are decoded from token payload; backend remains authoritative at runtime.',
    };
}
