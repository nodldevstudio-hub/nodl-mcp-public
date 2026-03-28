import { CollaborationRuntime } from '../../runtime/collaborationRuntime.js';

export interface ApplyGraphMutationArgs {
    type: string;
    payload: unknown;
}

export async function applyGraphMutationTool(
    runtime: CollaborationRuntime,
    args: ApplyGraphMutationArgs,
): Promise<Record<string, unknown>> {
    const result = await runtime.applyMutation(args.type, args.payload);
    return {
        ok: result.ok,
        reason: result.reason ?? null,
    };
}
