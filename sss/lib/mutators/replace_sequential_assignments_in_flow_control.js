const t = require('@babel/types');

function replaceSequentialAssignmentsInFlowControl(node, opts, parentStack) {
    let parentNode = parentStack.last();

    if (!parentNode) {
        return false;
    }
    
    let parent = parentNode.node;
    let parentProperty = parentNode?.propertyName;
    if (!parent) {
        return false;
    }

    if (["ReturnStatement"].includes(node.type) && node.argument?.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`Return argument is ${node.argument.type}`);
        }                
        let expressions = node.argument.expressions;
        let lastExpression = expressions.pop();
        node.argument = lastExpression;
        expressions = expressions.map(n => t.expressionStatement(n));

        try {
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with its content nodes
                let pos = parent[parentProperty].indexOf(node);
                let params = [pos, 0].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                let b = t.blockStatement(expressions.concat([node]));
                parent[parentProperty] = b;
                return true;
            }
        } catch (e) {
            console.log(`ERROR: ${parent.type} in property ${parentProperty}`, parent[parentProperty]);
            throw e;
        }    
    } else if (["ForStatement"].includes(node.type) && node.init && node.init.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`For init node is ${node.init.type}`);
        }                
        let expressions = node.init.expressions;
        let lastExpression = expressions.pop();
        node.init = lastExpression;
        expressions = expressions.map(n => {
            let e = t.expressionStatement(n);
            return e;
        });

        try {
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                let pos = parent[parentProperty].indexOf(node);
                let params = [pos, 0].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                let b = t.blockStatement(expressions.concat([node]));
                parent[parentProperty] = b;
                return true;
            }
        } catch (e) {
            console.log(`ERROR: ${parent.type} in property ${parentProperty}`, parent[parentProperty]);
            throw e;
        }    
    } else if (["IfStatement"].includes(node.type) && node.test && node.test.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`For test node is ${node.test.type}`);
        }                
        let expressions = node.test.expressions;
        let lastExpression = expressions.pop();
        node.test = lastExpression;
        expressions = expressions.map(n => {
            let e = t.expressionStatement(n);
            return e;
        });

        try {
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                let pos = parent[parentProperty].indexOf(node);
                let params = [pos, 0].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                let b = t.blockStatement(expressions.concat([node]));
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