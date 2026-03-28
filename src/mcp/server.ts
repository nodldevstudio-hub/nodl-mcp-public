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
import { applyGraphMutationTool } from './tools/applyGraphMutation.js';

const TOOLS: Tool[] = [
    {
        name: 'join_project',
        description:
            'Join a Nodl collaboration project room using a user-provided short-lived token.',
        inputSchema: {
            type: 'object',
            properties: {
                projectId: {
                    type: 'string',
                    description: 'Nodl project identifier',
                },
                token: {
                    type: 'string',
                    description: 'Short-lived collaboration token issued by Nodl backend',
                },
                endpoint: {
                    type: 'string',
                    description:
                        'Realtime endpoint base URL. Defaults to NODL_COLLAB_ENDPOINT env var or wss://realtime.nodl.dev',
                },
            },
            required: ['projectId', 'token'],
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
        name: 'apply_graph_mutation',
        description:
            'Apply a graph mutation to the active joined room. Backend remains authoritative.',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    description: 'Mutation type (addNode, moveNode, deleteNode, ...)',
                },
                payload: {
                    description: 'Structured mutation payload',
                },
            },
            required: ['type', 'payload'],
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
                    projectId: getStringArg(args, 'projectId'),
                    token: getStringArg(args, 'token'),
                    endpoint:
                        typeof args.endpoint === 'string' ? args.endpoint : undefined,
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

            if (name === 'apply_graph_mutation') {
                const response = await applyGraphMutationTool(runtime, {
                    type: getStringArg(args, 'type'),
                    payload: args.payload,
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
