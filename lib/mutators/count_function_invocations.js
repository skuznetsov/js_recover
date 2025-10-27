const t = require('@babel/types');
const Utils = require('../utils');

// FIX P1-2: Removed global.Functions (not used in this mutator)

function countFunctionInvocations(node, opt, parentStack) {
    let parent = parentStack.last()?.node;
    if (["NewExpression"].includes(node.type)) {
        let funcVar = Utils.findFunctionOnScope(node, node.callee, parentStack, opt)
        if (funcVar) {
            delete funcVar.isEmptyFunction;
            funcVar.callCount++;
        }
    } else if (["CallExpression"].includes(node.type)) {
        let funcVar = Utils.findFunctionOnScope(node, node.callee, parentStack, opt)
        if (funcVar) {
            funcVar.callCount++;
        }
    // } else if (node.type == "AssignmentExpression") {
    //     let functionName = Utils.extractVariableName(node.left);
    //     if (functionName) {
    //         let funcVar = Utils.findFunctionOnScope(node, node.left, parentStack)
    //         if (funcVar) {
    //             funcVar.value.callCount++;
    //         }
    //     }
    }

    return false;
}

module.exports = countFunctionInvocations;