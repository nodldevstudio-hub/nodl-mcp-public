import { io, Socket } from 'socket.io-client';
import {
    applyGraphMutationToState,
    applyGraphSnapshotToState,
    createEmptyGraphSessionState,
    GraphSessionState,
} from './state/graphSessionState.js';

export interface JoinSessionInput {
    endpoint: string;
    token: string;
}

export interface JoinSessionResult {
    projectId: string;
    mode: 'webrtc' | 'websocket';
    role: 'owner' | 'editor' | 'viewer';
    snapshot?: {
        nodes?: Record<string, unknown>;
        connections?: Record<string, unknown>;
    };
}

export class CollaborationRuntime {
    private socket: Socket | null = null;
    private currentProjectId: string | null = null;
    private endpoint: string | null = null;
    private graphSessionState: GraphSessionState = createEmptyGraphSessionState();
    private cursorIdentity: {
        actorId: string | null;
        actorType: string | null;
        displayName: string | null;
    } = {
        actorId: null,
        actorType: null,
        displayName: null,
    };

    async joinSession(input: JoinSessionInput): Promise<JoinSessionResult> {
        await this.disconnect();
        const namespaceUrl = this.normalizeEndpoint(input.endpoint);

        this.socket = io(namespaceUrl, {
            transports: ['websocket'],
            reconnection: false,
            auth: {
                token: input.token,
            },
        });

        await new Promise<void>((resolve, reject) => {
            const onConnect = () => {
                resolve();
            };
            const onConnectError = (error: Error) => {
                reject(error);
            };

            this.socket?.once('connect', onConnect);
            this.socket?.once('connect_error', onConnectError);
        });

        await this.waitForServerAuthentication();

        const joinAck = await this.requestJoinAck();

        this.currentProjectId = joinAck.projectId;
        this.endpoint = input.endpoint;
        this.graphSessionState = createEmptyGraphSessionState();
        this.graphSessionState.initialized = true;
        applyGraphSnapshotToState(this.graphSessionState, joinAck.snapshot);
        this.socket.on('collaboration:mutation', (event: any) => {
            if (!event || typeof event.type !== 'string') {
                return;
            }
            applyGraphMutationToState(
                this.graphSessionState,
                event.type,
                event.payload,
            );
        });

        return joinAck;
    }

    async refreshSessionSnapshot(): Promise<void> {
        if (!this.socket || !this.currentProjectId) {
            throw new Error('No active collaboration session. Call join_project first.');
        }

        const joinAck = await this.requestJoinAck();
        if (String(joinAck.projectId) !== String(this.currentProjectId)) {
            throw new Error('Snapshot refresh project mismatch.');
        }

        applyGraphSnapshotToState(this.graphSessionState, joinAck.snapshot);
    }

    setCursorIdentity(identity: {
        actorId?: string | null;
        actorType?: string | null;
        displayName?: string | null;
    }): void {
        this.cursorIdentity = {
            actorId:
                typeof identity.actorId === 'string' ? identity.actorId : null,
            actorType:
                typeof identity.actorType === 'string'
                    ? identity.actorType
                    : null,
            displayName:
                typeof identity.displayName === 'string' &&
                identity.displayName.trim().length > 0
                    ? identity.displayName.trim()
                    : null,
        };
    }

    async applyMutation(type: string, payload: unknown): Promise<{ ok: boolean; reason?: string }> {
        if (!this.socket || !this.currentProjectId) {
            throw new Error('No active collaboration session. Call join_project first.');
        }

        const ack = await new Promise<{ ok: boolean; reason?: string }>((resolve, reject) => {
            this.socket
                ?.timeout(5000)
                .emit(
                    'collaboration:mutation',
                    {
                        type,
                        payload,
                    },
                    (arg1: unknown, arg2?: unknown) => {
                        const { err, response } = this.parseAck(arg1, arg2);
                        if (err) {
                            reject(new Error('mutation timeout or rejection'));
                            return;
                        }
                        resolve({
                            ok: Boolean(response?.ok),
                            reason: response?.reason,
                        });
                    },
                );
        });

        if (ack.ok) {
            applyGraphMutationToState(this.graphSessionState, type, payload);
        }

        return ack;
    }

    async moveCursor(
        payload: Record<string, unknown>,
    ): Promise<{ ok: boolean; reason?: string }> {
        if (!this.socket || !this.currentProjectId) {
            throw new Error('No active collaboration session. Call join_project first.');
        }

        const displayName =
            typeof payload.displayName === 'string' &&
            payload.displayName.trim().length > 0
                ? payload.displayName.trim()
                : this.cursorIdentity.displayName;

        const userName =
            typeof payload.userName === 'string' &&
            payload.userName.trim().length > 0
                ? payload.userName.trim()
                : displayName;

        const ack = await new Promise<{ ok: boolean; reason?: string }>((resolve, reject) => {
            this.socket
                ?.timeout(5000)
                .emit(
                    'collaboration:cursor',
                    {
                        id: this.cursorIdentity.actorId,
                        actorId: this.cursorIdentity.actorId,
                        actorType: this.cursorIdentity.actorType,
                        displayName,
                        userName,
                        ...payload,
                    },
                    (arg1: unknown, arg2?: unknown) => {
                        const { err, response } = this.parseAck(arg1, arg2);
                        if (err) {
                            reject(new Error('cursor event timeout or rejection'));
                            return;
                        }
                        resolve({
                            ok: Boolean(response?.ok),
                            reason: response?.reason,
                        });
                    },
                );
        });

        return ack;
    }

    async disconnect(): Promise<void> {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.currentProjectId = null;
        this.endpoint = null;
        this.graphSessionState = createEmptyGraphSessionState();
        this.cursorIdentity = {
            actorId: null,
            actorType: null,
            displayName: null,
        };
    }

    getSessionInfo(): { projectId: string | null; endpoint: string | null } {
        return {
            projectId: this.currentProjectId,
            endpoint: this.endpoint,
        };
    }

    getGraphSessionState(): GraphSessionState {
        return structuredClone(this.graphSessionState);
    }

    private normalizeEndpoint(endpoint: string): string {
        const trimmed = endpoint.trim().replace(/\/+$/, '');
        if (trimmed.endsWith('/collaboration')) {
            return trimmed;
        }
        return `${trimmed}/collaboration`;
    }

    private async waitForServerAuthentication(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const socket = this.socket;
            if (!socket) {
                reject(new Error('Socket is not initialized.'));
                return;
            }

            const timeout = setTimeout(() => {
                cleanup();
                reject(
                    new Error(
                        'Server did not confirm collaboration authentication in time.',
                    ),
                );
            }, 5000);

            const cleanup = () => {
                clearTimeout(timeout);
                socket.off('collaboration:connected', onConnected);
                socket.off('collaboration:connection_error', onConnectionError);
                socket.off('disconnect', onDisconnect);
            };

            const onConnected = () => {
                cleanup();
                resolve();
            };

            const onConnectionError = (payload: { reason?: string } | undefined) => {
                cleanup();
                reject(
                    new Error(
                        payload?.reason ?? 'Server rejected collaboration connection.',
                    ),
                );
            };

            const onDisconnect = () => {
                cleanup();
                reject(new Error('Socket disconnected before authentication.'));
            };

            socket.once('collaboration:connected', onConnected);
            socket.once('collaboration:connection_error', onConnectionError);
            socket.once('disconnect', onDisconnect);
        });
    }

    private parseAck(
        arg1: unknown,
        arg2?: unknown,
    ): { err: unknown; response: any } {
        // Socket.IO client ACK callbacks can be either:
        // - (err, response) when using timeout error-first style
        // - (response) in some runtimes/proxies
        if (typeof arg2 !== 'undefined') {
            return { err: arg1, response: arg2 as any };
        }
        return { err: null, response: arg1 as any };
    }

    private async requestJoinAck(): Promise<JoinSessionResult> {
        return await new Promise<JoinSessionResult>((resolve, reject) => {
            this.socket
                ?.timeout(5000)
                .emit(
                    'collaboration:join',
                    {},
                    (arg1: unknown, arg2?: unknown) => {
                        const { err, response } = this.parseAck(arg1, arg2);
                        if (err) {
                            reject(new Error('join timeout or rejection'));
                            return;
                        }
                        if (!response?.ok) {
                            reject(new Error(response?.reason ?? 'join rejected'));
                            return;
                        }
                        resolve({
                            projectId: String(response.projectId),
                            mode: response.mode,
                            role: response.role,
                            snapshot:
                                typeof response.snapshot === 'object' &&
                                response.snapshot !== null
                                    ? response.snapshot
                                    : undefined,
                        });
                    },
                );
        });
    }
}
