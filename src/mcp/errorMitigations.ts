function has(haystack: string, needle: string): boolean {
    return haystack.includes(needle);
}

export function withMitigation(toolName: string, rawMessage: string): string {
    const message = String(rawMessage || 'Unknown error.');
    const lower = message.toLowerCase();

    const hints: string[] = [];

    if (
        has(lower, 'invalid or expired collaboration token') ||
        has(lower, 'expired') ||
        has(lower, 'jwt') ||
        has(lower, 'collab_token_invalid') ||
        has(lower, 'collab_token_missing') ||
        has(lower, 'missing collaboration token')
    ) {
        hints.push(
            'Generate a new collaboration token and retry join_project (default TTL is usually 15 minutes).',
        );
    }

    if (has(lower, 'token is missing projectid claim')) {
        hints.push(
            'Use a token generated from Share > Collaborate > MCP token for the intended project.',
        );
    }

    if (
        has(lower, 'mcp requires websocket mode') ||
        has(lower, 'collab_mode_mismatch') ||
        has(lower, 'mode mismatch')
    ) {
        hints.push(
            'Switch project collaboration mode to websocket in Nodl Share/Collaborate settings, then retry.',
        );
    }

    if (has(lower, 'missing collab:write scope')) {
        hints.push(
            'Use a token with collab:write scope (owner/editor token) before calling mutation tools.',
        );
    }
    if (has(lower, 'missing collab:cursor scope')) {
        hints.push(
            'Use a token with collab:cursor scope before calling move_cursor.',
        );
    }

    if (has(lower, 'no active collaboration session')) {
        hints.push('Call join_project first in the current MCP session/process.');
    }

    if (
        has(lower, 'join timeout or rejection') ||
        has(lower, 'server did not confirm collaboration authentication') ||
        has(lower, 'socket disconnected before authentication') ||
        has(lower, 'connection_error')
    ) {
        hints.push(
            'Verify endpoint and mode: endpoint should target backend /collaboration namespace and project mode should be websocket.',
        );
    }

    if (
        has(lower, 'invalid or missing string argument') ||
        has(lower, 'invalid or missing numeric argument') ||
        has(lower, 'invalid or missing object argument') ||
        has(lower, 'invalid or missing array argument')
    ) {
        hints.push(
            `Re-check ${toolName} input schema and required fields from list_tools, then retry with valid types.`,
        );
    }

    if (
        has(lower, 'requires source and target nodetype/type values') ||
        has(lower, 'connect_nodes requires both nodes to exist')
    ) {
        hints.push(
            'Call describe_current_nodes for the involved node IDs, then refresh session state or re-join before retrying connect_nodes.',
        );
    }

    if (
        has(lower, 'unknown source output port') ||
        has(lower, 'unknown target input port') ||
        has(lower, 'port type mismatch')
    ) {
        hints.push(
            'Call list_nodes (or describe_current_nodes + list_nodes) to verify exact port names/types before connect_nodes.',
        );
    }

    if (
        has(lower, 'describe_node_properties requires node') ||
        has(lower, 'edit_node_properties requires node')
    ) {
        hints.push(
            'Ensure node exists in current session state (join_project, then list_current_nodes/describe_current_nodes).',
        );
    }

    if (hints.length === 0) {
        hints.push(
            'Retry after join_project; if still failing, verify token validity, project mode=websocket, and tool input schema.',
        );
    }

    return `${message} Mitigation: ${hints.join(' ')}`;
}
