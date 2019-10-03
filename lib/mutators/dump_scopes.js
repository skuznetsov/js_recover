function dumpScopes(node, opts) {
    let parent = node.parentNode;
    if (node._state && node._state.scope && Object.keys(node._state.scope).length > 0) {
        let scope = "";
        if (parent.type == "FunctionDeclaration") {
            scope = " " + parent.id.name;
        } else if (parent.type == "FunctionExpression" && parent.parentNode.type == "AssignmentExpression" && parent.parentNode.left.type == "Identifier") {
            scope = " " + parent.parentNode.left.name;
        }
        console.log(`Scope${scope}:`);
        for (let [key, val] of Object.entries(node._state.scope)) { 
            console.log(`\tVariable ${key} ${val == null ? "is NOT USED" : "" }`);
        }
    }
    return false;
}

module.exports = dumpScopes;