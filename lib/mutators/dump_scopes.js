const Utils = require('../utils');

function dumpScopes(node, opts) {
    let parent = node.parentNode;
    if (node._state && Object.keys(node._state.scope.variables).length > 0) {
        let scope = "";
        if (parent.type == "FunctionDeclaration") {
            scope = " " + parent.id.name;
        } else if (parent.type == "FunctionExpression" && parent.parentNode.type == "AssignmentExpression") {
            scope = " " + Utils.extractVariableName(parent.parentNode.left);
        }
        console.log(`Scope${scope}:`);
        for (let [key, val] of Object.entries(node._state.scope.variables)) { 
            console.log(`\tVariable ${key} ${val == null ? "is NOT USED" : "" }`);
        }
    }
    return false;
}

module.exports = dumpScopes;