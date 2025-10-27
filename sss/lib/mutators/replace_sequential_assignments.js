const t = require('@babel/types');
const Utils = require('../utils');

function replaceSequentialAssignments(node, opts, parentStack) {
    let parentNode = parentStack.last();

    if (!parentNode) {
        return false;
    }
    
    let parent = parentNode.node;
    let parentProperty = parentNode.propertyName;

    if (!parent) {
        return false;
    }
    
    if (t.isSequenceExpression(node)) {
        let grandParent = parentStack.last(1);
        let grandParentNode = grandParent.node;
        let grandGrandParent = parentStack.last(2);
        let grandGrandParentNode = grandGrandParent.node;

        if (grandParentNode && t.isExpressionStatement(parent) && ["BlockStatement", "Program"].includes(grandParentNode.type)) {
            if (opts.config.verbose) {
                console.log(`Rewriting sequence expression. Parent is ${parent.type}, Grandparent is ${grandParentNode.type}`);
            }
            let child = parent;
            parentProperty = grandParent.propertyName;
            parent = grandParentNode;

            let expressions = node.expressions.map(n => {
                let e = t.expressionStatement(n);
                return e;
            });
            if (parent[parentProperty].constructor.name == "Array") {
                // Replace Sequence statement with it's content nodes
                let pos = parent[parentProperty].indexOf(child);
                let params = [pos, 1].concat(expressions);
                parent[parentProperty].splice.apply(parent[parentProperty], params);
                return true;
            } else {
                let b = t.blockStatement(expressions);
                parent[parentProperty] = b;
                return true;
            }
        } else if (node.parentNodeProperty == "right" &&
                   grandParentNode && t.isLogicalExpression(parent) &&
                   t.isExpressionStatement(grandParentNode) &&
                   t.isBlockStatement(grandGrandParentNode)) {
            if (opts.config.verbose) {
                console.log(`Rewriting sequence expression. Parent is ${parent.type}, Grandparent is ${grandParentNode.type}`);
            }
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
            block.parentNode = ifNode;
            block.parentNodeProperty = "consequent";
            testNode.parentNode = ifNode;
            testNode.parentNodeProperty = "test";

            Utils.replaceChildInParentNode(ifNode, grandParent);
            return true;
        }
    } else if (t.isExpressionStatement(node) && t.isLogicalExpression(node.expression)) {
        let child = node.expression;
        let testNode = child.operator == "||" ? t.unaryExpression("!", child.left) : child.left;
        let ifNode = t.ifStatement(testNode, Utils.makeBlockStatement(child.right));
        Utils.replaceChildInParentNode(ifNode, parentNode);
        return true;
    } else if (t.isExpressionStatement(node) && t.isConditionalExpression(node.expression)) {
        let child = node.expression;
        let ifNode = t.ifStatement(child.test, Utils.makeBlockStatement(child.consequent), Utils.makeBlockStatement(child.alternate));
        Utils.replaceChildInParentNode(ifNode, parentNode);
        return true;
    }
    return false;
}

module.exports = replaceSequentialAssignments;