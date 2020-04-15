const t = require('@babel/types');
const Utils = require('../utils.js');
const Scope = require('../scope');

function createScopes(node, opts) {
    let parent = node.parentNode;
    if (!parent) {
        return false;
    }

    if (t.isScopable(node)) {
        if (opts.config.verbose) {
            console.log(`Scope Definition. Name: ${node.type}`);
        }
        Scope.createScope(node);
    }
    if (t.isVariableDeclaration(node)) {
        let scope = Utils.findNodeScope(node)
        for(let declarationNode of node.declarations) {
            if (!declarationNode.init || ["MemberExpression", "Identifier"].includes(declarationNode.init.type)) {
                let variable = scope.addVariable(declarationNode.id);
                variable.value = declarationNode.init || null;
                if (opts.config.verbose) {
                    console.log(`Defining ${variable.name} of type ${(declarationNode.init || { type: "None" }).type} on scope`);
                }
            }
        }
    } else if (t.isFunctionDeclaration(node)) {
        let funcScope = Utils.findNodeScope(node.parentNode);
        let varScope = Utils.findNodeScope(node)
        funcScope.addFunction(node.id.name, node);
        for (let varObject of node.params) {
            varScope.addVariable(varObject.name);
        }
        if (opts.config.verbose) {
            console.log(`Defining function ${node.id.name} on scope`);
        }
    } else if (t.isFunctionExpression(node) && !t.isCallExpression(node.parentNode)) {
        let scope = Utils.findNodeScope(node.parentNode);
        let nameNode = null;
        switch (node.parentNode.type) {
            case "ObjectProperty":
                nameNode = node.parentNode.key;
                break;
            case "VariableDeclarator":
                nameNode = node.parentNode.id;
                break;
            case "NewExpression":
                node = node.parentNode;
                nameNode = node.parentNode.id;
                break;
            default:
                if ("left" in node.parentNode) {
                    nameNode = node.parentNode.left;
                } else {
                    return false;
                }
                break;

        }
        let functionName = Utils.extractVariableName(nameNode);
        if (!functionName) {
            return false;
        }
        console.log(`Defining funciton ${functionName}...`);
        scope.addFunction(functionName, node);
        if (opts.config.verbose) {
            console.log(`Defining function ${functionName} on scope`);
        }
    }
    
    return false;
}

module.exports = createScopes;