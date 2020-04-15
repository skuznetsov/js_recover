const t = require('@babel/types');
const Utils = require('../utils');

global.Functions = {};

function countFunctionInvocations(node, opts) {
    if (node.type == "CallExpression") {
        let functionName = Utils.extractVariableName(node.callee);
        let funcNode = global.Functions[functionName];
        if (funcNode) {
            funcNode.callCount++;
        }
    }

    return false;
}

module.exports = countFunctionInvocations;