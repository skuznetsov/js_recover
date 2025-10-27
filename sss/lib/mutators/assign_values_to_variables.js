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
            console.log(`Populating values to variable ${varName}.`);
            if (["MemberExpression", "Identifier"].includes(node.left.type)) {
                let variable = Utils.findVariableOnScope(node, node.left, parentStack);
                if (!variable) {
                    let globalScope = Scope.globalScope();
                    variable = globalScope.addVariable(node.left);
                    if (variable) {
                        variable.value = node.right;
                    }
                } else {
                    variable.value = node.right;
                }
            }
        } catch (ex) {
            console.log(`Error at node ${varName}:`);
            console.log(ex);
        }
    }
    return false;
}

module.exports = assignValuesToVariables;