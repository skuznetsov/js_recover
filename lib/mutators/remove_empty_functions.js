const t = require('@babel/types');
const Utils = require('../utils');

// FIX P1-2: Use context instead of global state

function removeEmptyFunctions(node, opts, parentStack) {
    // Initialize functions map if not present
    if (!opts.functions) {
        opts.functions = {};
    }

    let parent = parentStack.last()?.node;
    if (node.type == "FunctionDeclaration" &&
        node.body.type == "BlockStatement" &&
        node.body.body.length == 1 && node.body.body[0].type == "CallExpression"
    ) {
        let functionName = Utils.extractVariableName(node.body.body[0].callee);

        let childFunc = opts.functions[functionName];
        if (childFunc && childFunc.callCount < 2) {
            node.body = childFunc.body;
            Utils.removeChildFromParentNode(childFunc, parentStack);
            delete opts.functions[functionName];
            return true;
        }
    } else if (node.type == "FunctionDeclaration" &&
        node.body.type == "BlockStatement" &&
        node.body.body.length == 0
    ) {
        Utils.removeChildFromParentNode(node, parentStack);
        delete opts.functions[node.id.name];
        return true;
    } else if (node.type == "CallExpression") {
        let functionName = Utils.extractVariableName(node.callee);
        let functionNode = opts.functions[functionName];
        if (functionNode && functionNode.type == "FunctionDeclaration" && functionNode.isEmptyFunction) {
            // Note: 'stack' variable doesn't exist - should be 'parentStack'
            // This code appears to be broken/legacy

            Utils.removeChildFromParentNode(node, parentStack);
            delete opts.functions[functionName];

            // Legacy code - accessing stack array which doesn't exist
            // TODO: Fix this logic to use parentStack properly
            // node = stack[stack.length - 2];
            // if (node.type == "FunctionDeclaration" &&
            //     node.body.type == "BlockStatement" &&
            //     node.body.body.length == 0) {
            //     functionName = node.id.name;
            //     funcNode = opts.functions[functionName];
            //     if (funcNode) {
            //         funcNode.isEmptyFunction = true;
            //     }
            // }

            return true;
        }

        return false;
    }
}

module.exports = removeEmptyFunctions;