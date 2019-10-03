function assignValuesToVariables(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return false;
    }

    if (["AssignmentExpression","AssignmentPattern"].includes(node.type) && node.left.type == "Identifier" && node.operator == "=") {
        // if (config.verbose) {
            console.log(`Populating values to variable ${node.left.name}.`);
        // }
        let scope = null;
        let topNode = node;

        while (topNode) {
            if (topNode._state && topNode._state.scope) {
                scope = topNode._state.scope;
                if (node.left.name in scope) {
                    break;
                }
            }
            topNode = topNode.parentNode;
        }

        if (scope && node.left.name in scope) {
            scope[node.left.name] = node.right;
        } else {
            if (!scope) {
                console.log(`Scope is not defined for ${node.left.name}`);
            } else {
                console.log(`Cannot find definition of ${node.left.name} on parent scopes`);
            }
        }
    }
    return false;
}

module.exports = assignValuesToVariables;