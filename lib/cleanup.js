/**
 * Cleanup utilities to prevent memory leaks
 */

/**
 * Remove circular parent references from AST to allow garbage collection
 * This prevents memory leaks where entire AST is retained after processing
 *
 * @param {Object} node - AST node to clean
 */
function cleanupParentReferences(node) {
    if (!node || typeof node !== 'object') {
        return;
    }

    // Remove circular references
    delete node.parentNode;
    delete node.parentNodeProperty;

    // Recursively clean children
    for (const prop in node) {
        if (!node.hasOwnProperty(prop)) {
            continue;
        }

        const val = node[prop];

        if (val && typeof val === 'object') {
            if (val.type) {
                // It's an AST node
                cleanupParentReferences(val);
            } else if (Array.isArray(val)) {
                // It's an array of nodes
                for (const item of val) {
                    if (item && typeof item === 'object' && item.type) {
                        cleanupParentReferences(item);
                    }
                }
            }
        }
    }
}

/**
 * Cleanup processing context to free memory
 *
 * @param {Object} context - Processing context with astScopes
 */
function cleanupContext(context) {
    if (!context) {
        return;
    }

    // Clear scopes
    if (context.astScopes) {
        // Break parent references in scopes
        for (const scopeId in context.astScopes) {
            const scope = context.astScopes[scopeId];
            if (scope) {
                scope.parent = null;
                scope.node = null;
            }
        }

        context.astScopes = {};
    }
}

module.exports = {
    cleanupParentReferences,
    cleanupContext
};
