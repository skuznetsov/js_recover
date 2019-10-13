const Utils = require('../utils');

function assignValuesToVariables(node, opts) {
    let parent = node.parentNode;
    if (!parent) {
        return false;
    }

    if (["AssignmentExpression","AssignmentPattern"].includes(node.type) && node.operator == "=") {
        try {
            let varName = Utils.extractVariableName(node.left);
            let newValName = ["MemberExpression", "Identifier"].includes(node.right.type) ? Utils.extractVariableName(node.right) : null;
            if (!newValName || !varName) {
                return false;
            }
            console.log(`Populating values to variable ${varName}.`);
            if (node.left.type == "MemberExpression") {
                let variable = Utils.findVariableOnScope(node, node.left);
                if (!variable) {
                    let globalScope = Utils.findNodeScope(node, "Program");
                    let classObject = globalScope.addVariable(node.left);
                    classObject.value = node.right;
                } else {
                    let property = variable.addProperty(node.left);
                    property.value = node.right;
                }
            } else if (node.left.type == "Identifier") {
                let variable = Utils.findVariableOnScope(node, node.left);
                if (!variable) {
                    let globalScope = Utils.findNodeScope(node, "Program");
                    variable = globalScope.addVariable(node.left);
                    variable.value = node.right;
                } else {
                    variable.value = node.right;
                }
            }
        } catch (ex) {
            console.log(ex);
        }
    }
    return false;
}

module.exports = assignValuesToVariables;