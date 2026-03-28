export interface DecodedToken {
    exp?: number;
    projectId?: number;
    actorType?: string;
    actorId?: string;
    role?: string;
    scopes?: string[];
}

export function decodeTokenPayload(token: string): DecodedToken {
    const parts = token.split('.');
    if (parts.length < 2) {
        throw new Error('Invalid token format.');
    }

    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');

    return JSON.parse(decoded) as DecodedToken;
}

export function tokenExpirationStatus(token: string): {
    expiresAtIso: string | null;
    expired: boolean | null;
    secondsRemaining: number | null;
} {
    const payload = decodeTokenPayload(token);
    if (!payload.exp) {
        return {
            expiresAtIso: null,
            expired: null,
            secondsRemaining: null,
        };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const secondsRemaining = payload.exp - nowSeconds;
    return {
        expiresAtIso: new Date(payload.exp * 1000).toISOString(),
        expired: secondsRemaining <= 0,
        secondsRemaining,
    };
}
