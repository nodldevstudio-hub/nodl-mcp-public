import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { CollaborationRuntime } from '../runtime/collaborationRuntime.js';
import { joinProjectTool } from './tools/joinProject.js';
import { listCapabilitiesTool } from './tools/listCapabilities.js';
import {
    addNodeTool,
    connectNodesTool,
    disconnectNodesTool,
    editNodePropertiesTool,
    listCurrentNodesTool,
    listNodesTool,
    moveCursorTool,
    moveNodeTool,
    removeNodeTool,
} from './tools/graphTools.js';

const TOOLS: Tool[] = [
    {
        name: 'join_project',
        description:
            'Join a Nodl collaboration project room using a user-provided short-lived token.',
        inputSchema: {
            type: 'object',
            properties: {
                token: {
                    type: 'string',
                    description: 'Short-lived collaboration token issued by Nodl backend',
                },
                endpoint: {
                    type: 'string',
                    description:
                        'Realtime endpoint URL. Defaults to NODL_COLLAB_ENDPOINT/COLLAB_SECURE_WS_URL, else local backend fallback.',
                },
                displayName: {
                    type: 'string',
                    description:
                        'Optional display name used for MCP cursor presence (fallback: token displayName).',
                },
            },
            required: ['token'],
            additionalProperties: false,
        },
    },
    {
        name: 'list_capabilities',
        description: 'Decode token capabilities (scopes/role/expiry).',
        inputSchema: {
            type: 'object',
            properties: {
                token: {
                    type: 'string',
                    description: 'Short-lived collaboration token',
                },
            },
            required: ['token'],
            additionalProperties: false,
        },
    },
    {
        name: 'list_nodes',
        description:
            'List node catalog with optional filtering/limits (defaults to lightweight summary to avoid oversized outputs).',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description:
                        'Optional search term (matches nodeType/displayName/category).',
                },
                limit: {
                    type: 'number',
                    description: 'Max items to return (default 40, max 200).',
                },
                includePorts: {
                    type: 'boolean',
                    description: 'Include full input/output port metadata.',
                },
                includeProperties: {
                    type: 'boolean',
                    description: 'Include full node properties metadata.',
                },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'list_current_nodes',
        description:
            'List current session-scoped patch state known by this MCP process (nodes + connections).',
        inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: 'add_node',
        description: 'Add a node (validated wrapper over addNode mutation).',
        inputSchema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string' },
                nodeType: { type: 'string' },
                position: {
                    type: 'object',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                    },
                    required: ['x', 'y'],
                    additionalProperties: false,
                },
                properties: {
                    type: 'object',
                    additionalProperties: true,
                },
            },
            required: ['nodeId', 'nodeType', 'position'],
            additionalProperties: false,
        },
    },
    {
        name: 'remove_node',
        description: 'Remove a node (validated wrapper over deleteNode mutation).',
        inputSchema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string' },
            },
            required: ['nodeId'],
            additionalProperties: false,
        },
    },
    {
        name: 'move_node',
        description: 'Move a node (validated wrapper over moveNode mutation).',
        inputSchema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
            },
            required: ['nodeId', 'x', 'y'],
            additionalProperties: false,
        },
    },
    {
        name: 'edit_node_properties',
        description:
            'Edit one or more node properties (validated wrapper over updateNodeProperties mutation).',
        inputSchema: {
            type: 'object',
            properties: {
                nodeId: { type: 'string' },
                properties: {
                    type: 'object',
                    additionalProperties: true,
                },
            },
            required: ['nodeId', 'properties'],
            additionalProperties: false,
        },
    },
    {
        name: 'connect_nodes',
        description:
            'Connect two ports after local type-compatibility validation, then apply addConnection mutation.',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: { type: 'string' },
                fromNodeId: { type: 'string' },
                fromPort: { type: 'string' },
                toNodeId: { type: 'string' },
                toPort: { type: 'string' },
            },
            required: ['fromNodeId', 'fromPort', 'toNodeId', 'toPort'],
            additionalProperties: false,
        },
    },
    {
        name: 'disconnect_nodes',
        description:
            'Disconnect by connectionId or by endpoint tuple (wrapper over deleteConnection mutation).',
        inputSchema: {
            type: 'object',
            properties: {
                connectionId: { type: 'string' },
                fromNodeId: { type: 'string' },
                fromPort: { type: 'string' },
                toNodeId: { type: 'string' },
                toPort: { type: 'string' },
            },
            additionalProperties: false,
        },
    },
    {
        name: 'move_cursor',
        description: 'Broadcast a cursor position to collaborators.',
        inputSchema: {
            type: 'object',
            properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                displayName: {
                    type: 'string',
                    description:
                        'Optional display name override for this cursor event.',
                },
            },
            required: ['x', 'y'],
            additionalProperties: false,
        },
    },
];

function getStringArg(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`Invalid or missing string argument: ${key}`);
    }
    return value;
}

export async function startMcpServer(): Promise<void> {
    const runtime = new CollaborationRuntime();

    const server = new Server(
        {
            name: 'nodl-collab-mcp',
            version: '0.1.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return { tools: TOOLS };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const name = request.params.name;
        const args = (request.params.arguments ?? {}) as Record<string, unknown>;

        try {
            if (name === 'join_project') {
                const response = await joinProjectTool(runtime, {
                    token: getStringArg(args, 'token'),
                    endpoint:
                        typeof args.endpoint === 'string' ? args.endpoint : undefined,
                    displayName:
                        typeof args.displayName === 'string'
                            ? args.displayName
                            : undefined,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'list_capabilities') {
                const response = listCapabilitiesTool({
                    token: getStringArg(args, 'token'),
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'list_nodes') {
                const response = await listNodesTool({
                    query: typeof args.query === 'string' ? args.query : undefined,
                    limit: typeof args.limit === 'number' ? args.limit : undefined,
                    includePorts: args.includePorts === true,
                    includeProperties: args.includeProperties === true,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'list_current_nodes') {
                const response = listCurrentNodesTool(runtime);
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'add_node') {
                const position = args.position as { x: number; y: number };
                const response = await addNodeTool(runtime, {
                    nodeId: args.nodeId as string,
                    nodeType: args.nodeType as string,
                    position,
                    properties: args.properties as Record<string, unknown> | undefined,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'remove_node') {
                const response = await removeNodeTool(runtime, {
                    nodeId: args.nodeId as string,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'move_node') {
                const response = await moveNodeTool(runtime, {
                    nodeId: args.nodeId as string,
                    x: args.x as number,
                    y: args.y as number,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'edit_node_properties') {
                const response = await editNodePropertiesTool(runtime, {
                    nodeId: args.nodeId as string,
                    properties: args.properties as Record<string, unknown>,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'connect_nodes') {
                const response = await connectNodesTool(runtime, {
                    connectionId:
                        typeof args.connectionId === 'string'
                            ? args.connectionId
                            : undefined,
                    fromNodeId: args.fromNodeId as string,
                    fromPort: args.fromPort as string,
                    toNodeId: args.toNodeId as string,
                    toPort: args.toPort as string,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'disconnect_nodes') {
                const response = await disconnectNodesTool(runtime, {
                    connectionId:
                        typeof args.connectionId === 'string'
                            ? args.connectionId
                            : undefined,
                    fromNodeId:
                        typeof args.fromNodeId === 'string'
                            ? args.fromNodeId
                            : undefined,
                    fromPort:
                        typeof args.fromPort === 'string' ? args.fromPort : undefined,
                    toNodeId:
                        typeof args.toNodeId === 'string' ? args.toNodeId : undefined,
                    toPort: typeof args.toPort === 'string' ? args.toPort : undefined,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            if (name === 'move_cursor') {
                const response = await moveCursorTool(runtime, {
                    x: args.x as number,
                    y: args.y as number,
                    displayName:
                        typeof args.displayName === 'string'
                            ? args.displayName
                            : undefined,
                });
                return {
                    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
                };
            }

            throw new Error(`Unknown tool: ${name}`);
        } catch (error) {
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Tool ${name} failed: ${(error as Error).message}`,
                    },
                ],
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}
