const t = require('@babel/types');
const Utils = require('../utils');

global.Functions = {};

function defineFunction(node, opts) {
    if (node.type == "FunctionDeclaration" && node.id) {
        node.callCount = 0;
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
        global.Functions[node.id.name] = node;
    } else if (node.type == "FunctionExpression" && node.parentNode.type == "AssignmentExpression") {
        let functionName = Utils.extractVariableName(node.parentNode.left);
        node.callCount = 0;
        global.Functions[functionName] = node;
    }

    return false;
}

module.exports = defineFunction;