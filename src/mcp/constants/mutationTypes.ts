export const MUTATION_TYPES = {
    addNode: 'addNode',
    moveNode: 'moveNode',
    deleteNode: 'deleteNode',
    updateNodeProperties: 'updateNodeProperties',
    updateNodeProperty: 'updateNodeProperty',
    addConnection: 'addConnection',
    deleteConnection: 'deleteConnection',
} as const;

export type MutationType =
    (typeof MUTATION_TYPES)[keyof typeof MUTATION_TYPES];

export const KNOWN_MUTATION_TYPES: ReadonlySet<string> = new Set(
    Object.values(MUTATION_TYPES),
);
