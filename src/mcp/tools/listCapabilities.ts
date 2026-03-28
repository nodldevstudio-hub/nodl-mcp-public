import { decodeTokenPayload, tokenExpirationStatus } from './tokenUtils.js';

export interface ListCapabilitiesArgs {
    token: string;
}

export function listCapabilitiesTool(args: ListCapabilitiesArgs): Record<string, unknown> {
    const tokenPayload = decodeTokenPayload(args.token);
    const expiration = tokenExpirationStatus(args.token);

    return {
        ok: true,
        role: tokenPayload.role ?? null,
        actorType: tokenPayload.actorType ?? null,
        projectId: tokenPayload.projectId ?? null,
        scopes: tokenPayload.scopes ?? [],
        expiration,
        note: 'Capabilities are decoded from token payload; backend remains authoritative at runtime.',
    };
}
