const t = require('babel-types');

function replaceSequentialAssignmentsInFlowControl(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return false;
    }

    if (["ReturnStatement", "IfStatement"].includes(node.type) && node.argument && node.argument.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`Return argument is ${node.argument.type}`);
        }                
        let lastExpression = node.argument.expressions.pop();
        let expressions = node.argument.expressions.map(n => {
            let e = t.expressionStatement(n);
            n.parentNode = e;
            n.parentNodeProperty = "expression";
            e.parentNode = parent;
            e.parentNodeProperty = parentProperty;
            return e;
        });

        node.argument = lastExpression;
        try {
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                let pos = parent[parentProperty].indexOf(node);
                let params = [pos, 0].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                // expressions = _.map(e => { })
                let b = t.blockStatement(expressions.concat([node]));
                for(let e of expressions) {
                    e.parentNode = b;
                    e.parentNodeProperty = "body";
                }
                parent[parentProperty] = b;
                return true;
            }
        } catch (e) {
            console.log(`ERROR: ${parent.type} in property ${parentProperty}`, parent[parentProperty]);
            throw e;
        }    
    }
    return false;
}

module.exports = replaceSequentialAssignmentsInFlowControl;