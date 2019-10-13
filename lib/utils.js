const fs = require('fs');
const t = require('@babel/types');

class Utils {
    static wrapSingleStatementIntoBlock(node, prop) {
        if (prop == "type") {
            throw new Error('no type must be touched');
        }
        let tempNode = t.blockStatement([node[prop]]);
        tempNode.parentNode = node;
        tempNode.parentNodeProperty = prop;
        node[prop].parentNode = tempNode;
        node[prop].parentNodeProperty = "body";
        node[prop] = tempNode;
    }

    static createAllFoldersInPath(filePath) {
        let entries = filePath.split('/');
        let path = '';
        entries.forEach(function(element, idx) {
            if (element == "") {
                return;
            }
                
            if (idx >= entries.length - 1) {
                return;
            }
            path += (idx > 0 ? '/' : '') + element;
            try {
                fs.statSync(path);
            } catch(ex) {
                if (ex.code != 'ENOENT') {
                    console.log(ex);
                    throw ex;
                } else {
                    fs.mkdirSync(path);
                }
            }            
        });
    }

    static replaceChildInParentNode(node, newNode, numElementsToReplace) {
        numElementsToReplace = numElementsToReplace || 1;
        let parent = node.parentNode;
        let parentProperty = node.parentNodeProperty;
        if (!parent) {
            return;
        }
        
        newNode.parentNode = parent;
        newNode.parentNodeProperty = parentProperty;
        if (parent[parentProperty].constructor.name == "Array") {
            // Replace Sequence statement with it's content nodes
            let pos = parent[parentProperty].indexOf(node);
            let params = [pos, numElementsToReplace].concat(newNode);
            parent[parentProperty].splice.apply(parent[parentProperty], params);
        } else {
            parent[parentProperty] = newNode;
        }
    }

    static makeBlockStatement(arr) {
        let expressions = [];
        if (arr.type && arr.type == "SequenceExpression") {
            arr = arr.expressions;
        }
        if (arr.constructor.name == "Array") {
            expressions = arr.map(n => {
                if (!t.isExpressionStatement(n)) {
                    let e = t.expressionStatement(n);
                    n.parentNode = e;
                    n.parentNodeProperty = "expression";
                    return e;
                } else {
                    return n;
                }
            });
        } else if (!t.isExpressionStatement(arr)) {
            let e = t.expressionStatement(arr);
            arr.parentNode = e;
            arr.parentNodeProperty = "expression";
            expressions = [e];
        } else {
            expressions = [arr];
        }
        let blockNode = t.blockStatement(expressions);
        for(let e of expressions) { 
            e.parentNode = blockNode;
            e.parentNodeProperty = "body";
        }
        return blockNode;
    }

    static findNodeScope(node, parentNodeType) {
        let scope = null;
        let topNode = node;

        while (topNode) {
            if (topNode._state_id && global.astScopes) {
                if (parentNodeType && parentNodeType == topNode.type) {
                    scope = global.astScopes[topNode._state_id];
                    break;
                } else {
                    scope = global.astScopes[topNode._state_id];
                    break;
                }
            }
            topNode = topNode.parentNode;
        }
        return scope;
    }

    static findVariableOnScope(node, variable) {
        let scope = this.findNodeScope(node);
        if (scope) {
            return scope.getVariable(variable);
        }
        return null;
    }


    static extractVariableName(node) {
        if (!node || ( node.object && node.object.type == "NewExpression")) {
            return null;
        }
        if (node.type == "Identifier") {
            return node.name;
        } else if (node.type == "MemberExpression" && ["Identifier", "MemberExpression"].includes(node.property.type)) {
            return this.extractVariableName(node.object) + "." + this.extractVariableName(node.property);
        } else if (node.type == "ThisExpression") {
            return "this";
        } else if (node.type == "AssignmentExpression") {
            return this.extractVariableName(node.left);
        }
        return null;
    }

    static extractVariableParts(node) {
        if (!node || ( node.object && node.object.type == "NewExpression")) {
            return null;
        }
        let parts = [];
        if (node.type == "Identifier") {
            return [node.name];
        } else if (node.type == "MemberExpression" && ["Identifier", "MemberExpression"].includes(node.property.type)) {
            return this.extractVariableParts(node.object).concat(this.extractVariableParts(node.property));
        } else if (node.type == "ThisExpression") {
            return ["this"];
        } else if (node.type == "AssignmentExpression") {
            return [this.extractVariableParts(node.left)];
        }
        return null;
    }

    static IsControlFlowStatement(node) {
        return ["WithStatement",
             "IfStatement",
             "ForStatement",
             "WhileStatement",
             "DoWhileStatement",
             "TryStatement",
             "CatchClause",
             "SwitchStatement",
             "ForInStatement",
             "ForOfStatement",
             "FunctionDeclaration"
            ].includes(node.type);
      }
      
}
module.exports = Utils;