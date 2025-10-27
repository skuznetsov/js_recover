const t = require('@babel/types');
const Utils = require('../utils');
const Scope = require('../scope');
const Function = require('../function');

function createScopes(node, opts, parentStack) {
    let parentNode = parentStack.last()?.node;
    if (!parentNode) {
        return false;
    }

    if (t.isScopable(node)) {
        if (opts.config.verbose) {
            console.log(`Scope Definition. Name: ${node.type}`);
        }
        Scope.createScope(node, parentNode, parentStack);
    }
    if (t.isVariableDeclaration(node)) {
        let scope = Utils.findNodeScope(node, parentStack)
        if (scope) {
            for(let declarationNode of node.declarations) {
                if (!declarationNode.init || ["MemberExpression", "Identifier"].includes(declarationNode.init.type)) {
                    let variable = scope.addVariable(declarationNode.id);
                    if (variable) {
                        variable.value = declarationNode.init || null;
                    }
                    if (opts.config.verbose) {
                        console.log(`Defining ${variable.name} of type ${(declarationNode.init || { type: "None" }).type} on scope`);
                    }
                }
            }
        }
    } else if (t.isFunctionDeclaration(node)) {
        let funcScope = Utils.findNodeScope(parentNode, parentStack);
        let varScope = Utils.findNodeScope(node, parentStack)
        if (funcScope && varScope) {
            funcScope.addFunction(node.id, node);
            for (let varObject of node.params) {
                varScope.addVariable(varObject);
            }
            if (opts.config.verbose) {
                console.log(`Defining function ${node.id.name} on scope`);
            }
        }
    } else if (t.isFunctionExpression(node) && !t.isCallExpression(parentNode)) {
        let scope = Utils.findNodeScope(parentNode, parentStack);
        if (scope) {
            let nameNode = null;
            switch (parentNode.type) {
                case "ObjectProperty":
                    nameNode = parentNode.key;
                    break;
                case "VariableDeclarator":
                    nameNode = parentNode.id;
                    break;
                case "NewExpression":
                    node = parentNode;
                    nameNode = parentNode.id;
                    break;
                default:
                    if ("left" in parentNode) {
                        nameNode = parentNode.left;
                    } else {
                        return false;
                    }
                    break;

            }
            let functionScope = Utils.findNodeScope(parentNode, parentStack);
            if (!functionScope) {
                // TODO: Should I create global stack here?
                return false;
            }
            if (opts.config.verbose) {
                console.log(`Defining function ${Utils.extractVariableName(parentNode.left || parentNode.key)} on scope`);
            }
            let funcVar = scope.addFunction(parentNode.left || parentNode.key, node);
            
        }
    }
    
    return false;
}

module.exports = createScopes;