const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Apply Grok-suggested function renames
 *
 * This mutator processes FunctionDeclaration and FunctionExpression nodes
 * and renames them based on grokSuggestedName stored in Function instances.
 *
 * Note: Function calls are NOT renamed here - they are Identifier nodes
 * that will be handled by rename_variables.js mutator.
 */
function applyFunctionRenames(node, opts, parentStack) {
    if (!node) {
        return false;
    }

    // Process FunctionDeclaration nodes
    if (node.type === 'FunctionDeclaration' && node.id) {
        const funcName = node.id.name;

        // Find the Function instance in scopes
        const scope = Utils.findNodeScope(node, parentStack, opts);
        if (!scope) {
            return false;
        }

        const variable = scope.getVariable(funcName);
        if (!variable || !variable.value || variable.value.constructor?.name !== 'Function') {
            return false;
        }

        const func = variable.value;

        // Check if Grok suggested a new name
        if (func.grokSuggestedName && func.grokSuggestedName !== funcName) {
            const newName = func.grokSuggestedName;

            // Rename the function Identifier
            node.id.name = newName;

            // Update Function._name for consistency
            if (func._name && func._name.name) {
                func._name.name = newName;
            }

            // CRITICAL: Store in grokSuggestedName for renameVariables mutator
            // DO NOT change variable.name - it's the dictionary key!
            if (variable) {
                variable.grokSuggestedName = newName;
                variable.grokConfidence = func.grokConfidence;
            }

            console.log(`  [Rename] function ${funcName}() → ${newName}() (${func.grokConfidence || 'medium'})`);

            return true;
        }
    }

    // Process FunctionExpression assigned to variables (var foo = function() {})
    if (node.type === 'FunctionExpression') {
        const parent = parentStack.last()?.node;

        // Check if this is var foo = function() {} pattern
        if (parent && parent.type === 'VariableDeclarator' && parent.id) {
            const funcName = parent.id.name;

            const scope = Utils.findNodeScope(node, parentStack, opts);
            if (!scope) {
                return false;
            }

            const variable = scope.getVariable(funcName);
            if (!variable || !variable.value || variable.value.constructor?.name !== 'Function') {
                return false;
            }

            const func = variable.value;

            // Check if Grok suggested a new name
            if (func.grokSuggestedName && func.grokSuggestedName !== funcName) {
                const newName = func.grokSuggestedName;

                // Rename the variable declarator (not the function itself)
                parent.id.name = newName;

                // Update Function._name for consistency
                if (func._name && func._name.name) {
                    func._name.name = newName;
                }

                // CRITICAL: Store in grokSuggestedName for renameVariables mutator
                // DO NOT change variable.name - it's the dictionary key!
                if (variable) {
                    variable.grokSuggestedName = newName;
                    variable.grokConfidence = func.grokConfidence;
                }

                console.log(`  [Rename] var ${funcName} = function() → var ${newName} = function() (${func.grokConfidence || 'medium'})`);

                return true;
            }
        }
    }

    return false;
}

module.exports = applyFunctionRenames;
