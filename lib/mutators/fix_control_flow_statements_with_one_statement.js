const t = require('@babel/types');
const Utils = require("../utils");

function fixControlFlowStatementsWithOneStatement(node, opts)
{
    let wasChanged = false;
    if (Utils.IsControlFlowStatement(node))
    {
        if (node.body && !["EmptyStatement", "BlockStatement"].includes(node.body.type))
        {
            Utils.wrapSingleStatementIntoBlock(node, "body");
            wasChanged = true;
        }
        if (node.consequent && node.consequent.type != "BlockStatement")
        {
            Utils.wrapSingleStatementIntoBlock(node, "consequent");
            wasChanged = true;
        }
        if (node.alternate && !["IfStatement", "BlockStatement"].includes(node.alternate.type)) {
            Utils.wrapSingleStatementIntoBlock(node, "alternate");
            wasChanged = true;
        }
    }
    return wasChanged;
}

module.exports = fixControlFlowStatementsWithOneStatement;