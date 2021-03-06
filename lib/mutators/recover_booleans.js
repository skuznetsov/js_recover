const t = require('@babel/types');
const Utils = require('../utils');

function recoverBooleans(node, opts) {
    if (node.type == "UnaryExpression" && ["!", "void"].includes(node.operator) && 
        node.argument.type == "NumericLiteral" && [0,1].includes(node.argument.value)) {
        if (opts.config.verbose) {
            console.log('Rewriting !(0|1) or (void 0) expression.');
        }
        let newNode = node.operator == "!" ? t.booleanLiteral(!node.argument.value) : t.identifier("undefined");
        Utils.replaceChildInParentNode(node, newNode);
        return true;
    }
    return false;
}

module.exports = recoverBooleans;