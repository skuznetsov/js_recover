const t = require('babel-types');
const {replaceChildInParentNode} = require('../utils');

function replaceSequentialAssignments(node, opts) {
    let parent = node.parentNode;
    let parentProperty = node.parentNodeProperty;
    if (!parent) {
        return false;
    }
    
    if (node.type == "SequenceExpression") {
        if (parent.parentNode && ["ExpressionStatement"].includes(parent.type) && ["BlockStatement", "Program"].includes(parent.parentNode.type)) {
            if (opts.config.verbose) {
                console.log(`Rewriting sequence expression. Parent is ${parent.type}, Grandparent is ${parent.parentNode.type}`);
            }
            let child = node;
            if (parent.type == "ExpressionStatement") {
                parentProperty = parent.parentNodeProperty;
                child = parent;
                parent = parent.parentNode;
            }

            let expressions = node.expressions.map(n => {
                let e = t.expressionStatement(n);
                n.parentNode = e;
                n.parentNodeProperty = "expression";
                return e;
            });
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                for(let e of expressions) { 
                    e.parentNode = parent;
                    e.parentNodeProperty = parentProperty;
                }
                let pos = parent[parentProperty].indexOf(child);
                let params = [pos, 1].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                let b = t.blockStatement(expressions);
                for(let e of expressions) { 
                    e.parentNode = b;
                    e.parentNodeProperty = "body";
                }
                parent[parentProperty] = b;
                return true;
            }
        } else if (node.parentNodeProperty == "right" &&
                   parent.parentNode && ["LogicalExpression"].includes(parent.type) &&
                   parent.parentNode.type == "ExpressionStatement" &&
                   parent.parentNode.parentNode.type == "BlockStatement") {
            if (opts.config.verbose) {
                console.log(`Rewriting sequence expression. Parent is ${parent.type}, Grandparent is ${parent.parentNode.type}`);
            }
            let grandparent = parent.parentNode;
            let grandparentProperty = parent.parentNodeProperty;
            let grand2parent = grandparent.parentNode;
            let grand2parentProperty = grandparent.parentNodeProperty;
            let replacementPos = grand2parent[grand2parentProperty].indexOf(grandparent);
            let testNode = parent.operator == "||" ? t.unaryExpression("!", parent.left) : parent.left;

            let expressions = node.expressions.map(n => {
                let e = t.expressionStatement(n);
                n.parentNode = e;
                n.parentNodeProperty = "expression";
                return e;
            });
            let block = t.blockStatement(expressions);
            for(let e of expressions) { 
                e.parentNode = block;
                e.parentNodeProperty = "body";
            }
            let ifNode = t.ifStatement(testNode, block);

            replaceChildInParentNode(grandparent, ifNode, 1);
            return true;
        }
    }
    return false;
}

module.exports = replaceSequentialAssignments;