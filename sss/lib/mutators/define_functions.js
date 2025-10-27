const t = require('@babel/types');
const Utils = require('../utils');

global.Functions = {};

function defineFunction(node, opts, parentStack) {
    let parent = parentStack.last()?.node;

    if (node.type == "FunctionDeclaration" && node.id) {
        node.callCount = 0;
        // TODO: Check that it is not a class constructor
        // if it is a constructor it should have a variable of the same name defined somewhere on the scopes
        if (node.body.type == "BlockStatement" &&
            (
                node.body.body.length == 0 ||
                (
                    node.body.body.length == 1 &&
                    node.body.body[0].type == "ReturnStatement" &&
                    node.body.body[0].argument == null
                )
            )
        ) {
            node.isEmptyFunction = true;
        }
        let funcVar = Utils.findVariableOnScope(node, node.id.name, parentStack);
        if (funcVar?.value?.definers[0] == node) {
            console.log("sdsdsd");
        }
        // let definedNode = global.Functions[node.id.name];
        // // if (definedNode) {
        // //     console.error(`Function ${node.id.name} is about to be redefined. Deleting the node.`);
        // //     Utils.removeChildFromParentNode(definedNode);
        // // }
        // global.Functions[node.id.name] = node;
    } else if (node.type == "FunctionExpression" && node.parentNode?.type == "AssignmentExpression") {
        let functionName = Utils.extractVariableName(node.parentNode.left);
        node.callCount = 0;
        let definedNode = global.Functions[functionName];
        if (definedNode) {
            console.error(`Function ${functionName} is about to be redefined. Deleting the node.`);
            Utils.removeChildFromParentNode(definedNode);
        }
        global.Functions[functionName] = node;
    }

    return false;
}

module.exports = defineFunction;