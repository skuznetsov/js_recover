const t = require('@babel/types');

function replaceSequentialAssignmentsInFlowControl(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return false;
    }

    if (["ReturnStatement"].includes(node.type) && node.argument && node.argument.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`Return argument is ${node.argument.type}`);
        }                
        let expressions = node.argument.expressions;
        let lastExpression = expressions.pop();
        node.argument = lastExpression;
        expressions = expressions.map(n => {
            let e = t.expressionStatement(n);
            n.parentNode = e;
            n.parentNodeProperty = "expression";
            e.parentNode = parent;
            e.parentNodeProperty = parentProperty;
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
    } else if (["ForStatement"].includes(node.type) && node.init && node.init.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`For init node is ${node.init.type}`);
        }                
        let expressions = node.init.expressions;
        let lastExpression = expressions.pop();
        node.init = lastExpression;
        expressions = expressions.map(n => {
            let e = t.expressionStatement(n);
            n.parentNode = e;
            n.parentNodeProperty = "expression";
            e.parentNode = parent;
            e.parentNodeProperty = parentProperty;
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
    } else if (["IfStatement"].includes(node.type) && node.test && node.test.type == "SequenceExpression") {
        if (opts.config.verbose) {
            console.log(`For test node is ${node.test.type}`);
        }                
        let expressions = node.test.expressions;
        let lastExpression = expressions.pop();
        node.test = lastExpression;
        expressions = expressions.map(n => {
            let e = t.expressionStatement(n);
            n.parentNode = e;
            n.parentNodeProperty = "expression";
            e.parentNode = parent;
            e.parentNodeProperty = parentProperty;
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