const {wrapSingleStatementIntoBlock} = require("../utils");

function fixControlFlowStatementsWithOneStatement(node, opts)
{
    let wasChanged = false;
    if (opts && opts.generator)
    {
        let jsGen = opts.generator;
        if (jsGen.IsControlFlowStatement(node))
        {
            if (node.body && !["EmptyStatement", "BlockStatement"].includes(node.body.type))
            {
                wrapSingleStatementIntoBlock(node, "body");
                wasChanged = true;
            }
            if (node.consequent && node.consequent.type != "BlockStatement")
            {
                wrapSingleStatementIntoBlock(node, "consequent");
                wasChanged = true;
            }
            if (node.alternate && !["IfStatement", "BlockStatement"].includes(node.alternate.type)) {
                wrapSingleStatementIntoBlock(node, "alternate");
                wasChanged = true;
            }
        }
    }
    return wasChanged;
}

module.exports = fixControlFlowStatementsWithOneStatement;