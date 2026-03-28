export interface CollaborationTokenClaims {
    exp?: number;
    projectId?: number;
    actorType?: string;
    actorId?: string;
    displayName?: string;
    role?: string;
    scopes?: string[];
}

export interface TokenExpiration {
    expiresAtIso: string | null;
    expired: boolean | null;
    secondsRemaining: number | null;
}

export interface ResolvedToken {
    claims: CollaborationTokenClaims;
    expiration: TokenExpiration;
}

export function maskToken(token: string): string {
    if (token.length <= 10) {
        return '***';
    }
    return `${token.slice(0, 6)}...${token.slice(-4)}`;
}

export function resolveToken(
    token: string,
    options?: { requireNotExpired?: boolean },
): ResolvedToken {
    const claims = decodeTokenPayload(token);
    const expiration = getTokenExpiration(claims);

    if (options?.requireNotExpired && expiration.expired === true) {
        throw new Error(
            `Collaboration token is expired (exp=${expiration.expiresAtIso ?? 'unknown'}).`,
        );
    }

    return { claims, expiration };
}

export function assertTokenProjectMatch(
    tokenProjectId: number | undefined,
    inputProjectId: string,
): void {
    if (tokenProjectId === undefined) {
        return;
    }
    if (String(tokenProjectId) !== String(inputProjectId)) {
        throw new Error(
            `Token project mismatch: token=${tokenProjectId}, input=${inputProjectId}.`,
        );
    }
}

function decodeTokenPayload(token: string): CollaborationTokenClaims {
    const parts = token.split('.');
    if (parts.length < 2) {
        throw new Error(
            `Invalid token format (token=${maskToken(token)}). Expected JWT payload.`,
        );
    }

    try {
        const payload = parts[1];
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(
            normalized.length + ((4 - (normalized.length % 4)) % 4),
            '=',
        );
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(decoded) as CollaborationTokenClaims;
    } catch {
        throw new Error(
            `Invalid token payload encoding (token=${maskToken(token)}).`,
        );
    }
}

function getTokenExpiration(
    claims: CollaborationTokenClaims,
): TokenExpiration {
    if (!claims.exp) {
        return {
            expiresAtIso: null,
            expired: null,
            secondsRemaining: null,
        };
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const secondsRemaining = claims.exp - nowSeconds;
    return {
        expiresAtIso: new Date(claims.exp * 1000).toISOString(),
        expired: secondsRemaining <= 0,
        secondsRemaining,
    };
}
