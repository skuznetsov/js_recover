const Utils = require('../utils');

function dumpScopes(node, opts) {
    let parent = node.parentNode;
    if (node._state_id) {
        let scope = global.astScopes[node._state_id];
        if (scope.getVariableNames().length == 0) {
            return false;
        }
        let scopeName = "";
        if (parent.type == "FunctionDeclaration") {
            scopeName = " " + parent.id.name;
        } else if (parent.type == "FunctionExpression" && parent.parentNode.type == "AssignmentExpression") {
            scopeName = " " + Utils.extractVariableName(parent.parentNode.left);
        } else if (scope.parent == null) {
            scopeName = " Global";
        }
        console.log(`Scope${scopeName}:`);
        for (let varName of scope.getVariableNames()) { 
            let variable = scope.getVariable(varName);
            if (variable.isUsed() == 0) {
                console.log(`\tVariable ${varName} is NOT USED`);
            } else {
                console.log(`\tVariable ${varName}:`);
                

            }
        }
    }
    return false;
}

module.exports = dumpScopes;