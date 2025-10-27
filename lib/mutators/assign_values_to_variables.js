const Utils = require('../utils');
const Scope = require('../scope');

function assignValuesToVariables(node, opts, parentStack) {
    let parent = parentStack.last()?.node;
    if (!parent) {
        return false;
    }

    if (["AssignmentExpression","AssignmentPattern"].includes(node.type) && node.operator == "=") {
        let varName = Utils.extractVariableName(node.left);
        try {
            let newValName = ["MemberExpression", "Identifier"].includes(node.right.type) ? Utils.extractVariableName(node.right) : null;
            if (!newValName || !varName) {
                return false;
            }
            if (opts.config && opts.config.verbose) {
                console.log(`Populating values to variable ${varName}.`);
            }
            if (["MemberExpression", "Identifier"].includes(node.left.type)) {
                let variable = Utils.findVariableOnScope(node, node.left, parentStack, opts);
                if (!variable) {
                    let globalScope = Scope.globalScope(opts);
                    variable = globalScope.addVariable(node.left);
                    if (variable) {
                        variable.value = node.right;
                    }
                } else {
                    variable.value = node.right;
                }
            }
        } catch (ex) {
            if (opts.config && opts.config.verbose) {
                console.log(`Error at node ${varName}:`);
                console.log(ex);
            }
        }
    }
    return false;
}

module.exports = assignValuesToVariables;