function createScopes(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return false;
    }

    if (["BlockStatement", "Program"].includes(node.type)) {
        if (opts.config.verbose) {
            console.log(`Scope Definition. Name: ${node.parentNode.type}`);
        }
        node._state = node._state || { scope: {} };
        node._state.scope = node._state.scope || {};
        for(let n of node.body) {
            if (n.type == "VariableDeclaration") {
                for(let declarationNode of n.declarations) {
                    node._state.scope[declarationNode.id.name] = declarationNode.init || null;
                    if (opts.config.verbose) {
                        console.log(`Defining ${declarationNode.id.name} of type ${(declarationNode.init || { type: "None" }).type} on scope`);
                    }
                }
            } else if (n.type == "FunctionDeclaration") {
                node._state.scope[n.id.name] = n;
                if (opts.config.verbose) {
                    console.log(`Defining function ${n.id.name} on scope`);
                }        
            } else {
                if (opts.config.verbose) {
                    console.log(`Node type: ${n.type}`);
                }        
            }    
        }
    }
    return false;
}

module.exports = createScopes;