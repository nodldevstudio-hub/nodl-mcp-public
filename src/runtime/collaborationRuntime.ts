import { io, Socket } from 'socket.io-client';
import {
    applyGraphMutationToState,
    createEmptyGraphSessionState,
    GraphSessionState,
} from './state/graphSessionState.js';

export interface JoinSessionInput {
    endpoint: string;
    projectId: string;
    token: string;
}

export interface JoinSessionResult {
    projectId: string;
    mode: 'webrtc' | 'websocket';
    role: 'owner' | 'editor' | 'viewer';
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

        const joinAck = await new Promise<JoinSessionResult>((resolve, reject) => {
            this.socket
                ?.timeout(5000)
                .emit(
                    'collaboration:join',
                    { projectId: Number(input.projectId) },
                    (err: unknown, response: any) => {
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
                        });
                    },
                );
        });

        this.currentProjectId = joinAck.projectId;
        this.endpoint = input.endpoint;
        this.graphSessionState = createEmptyGraphSessionState();
        this.graphSessionState.initialized = true;
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
                        projectId: Number(this.currentProjectId),
                        type,
                        payload,
                    },
                    (err: unknown, response: any) => {
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
                        projectId: Number(this.currentProjectId),
                        id: this.cursorIdentity.actorId,
                        actorId: this.cursorIdentity.actorId,
                        actorType: this.cursorIdentity.actorType,
                        displayName,
                        userName,
                        ...payload,
                    },
                    (err: unknown, response: any) => {
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
}
