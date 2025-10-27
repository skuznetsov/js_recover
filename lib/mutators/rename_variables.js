const t = require('@babel/types');
const Utils = require('../utils.js');

/**
 * Apply variable renames from Grok analysis
 *
 * This mutator reads grokSuggestedName from Variable objects in scopes
 * and renames all Identifier nodes that reference those variables.
 */
function renameVariables(node, opt, parentStack) {
    if (!node) {
        return false;
    }

    // Only process Identifier nodes (actual variable references)
    if (node.type !== 'Identifier') {
        return false;
    }

    let parent = parentStack.last()?.node;

    // Skip if this is a property key (obj.prop should not rename 'prop')
    if (parent && parent.type === 'MemberExpression' && parent.property === node && !parent.computed) {
        return false;
    }

    // Skip if this is a property in object literal
    if (parent && parent.type === 'Property' && parent.key === node && !parent.computed) {
        return false;
    }

    // Find the containing scope for this Identifier
    const scope = Utils.findNodeScope(node, parentStack, opt);
    if (!scope) {
        return false;
    }

    // Look up the variable by name using scope.getVariable() which searches up the scope chain
    const variable = scope.getVariable(node.name);
    if (!variable) {
        return false;
    }

    // Check if Grok suggested a new name
    if (variable.grokSuggestedName && variable.grokSuggestedName !== node.name) {
        const oldName = node.name;
        const newName = variable.grokSuggestedName;

        // Apply the rename
        node.name = newName;

        console.log(`  Renamed: ${oldName} → ${newName} (${variable.grokConfidence || 'medium'})`);

        return true;
    }

    return false;
}

module.exports = renameVariables;