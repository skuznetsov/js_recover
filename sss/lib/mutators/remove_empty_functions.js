const t = require('@babel/types');
const Utils = require('../utils');

function removeEmptyFunctions(node, opts, parentStack) {
    let parent = parentStack.last()?.node;
    if (node.type == "FunctionDeclaration" &&
        node.body.type == "BlockStatement" &&
        node.body.body.length == 1 && node.body.body[0].type == "CallExpression"
    ) {
        let functionName = Utils.extractVariableName(node.body.body[0].callee);

        let childFunc = global.Functions[functionName];
        if (childFunc.callCount < 2) {
            node.body = childFunc.body;
            Utils.removeChildFromParentNode(childFunc, stack);
            delete global.Functions[functionName];
            return true;
        }
    } else if (node.type == "FunctionDeclaration" &&
        node.body.type == "BlockStatement" &&
        node.body.body.length == 0
    ) {
        Utils.removeChildFromParentNode(node, stack);
        delete Functions[node.id.name];
        return true;
    } else if (node.type == "CallExpression") {
        let functionName = Utils.extractVariableName(node.callee);
        let functionNode = Functions[functionName];
        if (functionNode && functionNode.type == "FunctionDeclaration" && functionNode.isEmptyFunction) {
            let parentNode = stack[stack.length - 1];
            if (parentNode.type == "ExpressionStatement") {
                node = parentNode;
            }

            Utils.removeChildFromParentNode(node, stack);
            delete Functions[functionName];

            node = stack[stack.length - 2];
            if (node.type == "FunctionDeclaration" &&
                node.body.type == "BlockStatement" &&
                node.body.body.length == 0) {
                functionName = node.id.name;
                funcNode = global.Functions[functionName];
                if (funcNode) {
                    funcNode.isEmptyFunction = true;
                }
            }

            return true;
        }

        return false;
    }
}

module.exports = removeEmptyFunctions;