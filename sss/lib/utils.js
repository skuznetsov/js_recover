const fs = require('fs');
const t = require('@babel/types');

class Utils {
    static wrapSingleStatementIntoBlock(node, prop) {
        if (prop == "type") {
            throw new Error('no type must be touched');
        }
        let tempNode = t.blockStatement([node[prop]]);
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

    static replaceChildInParentNode(newNode, parentStackNode, numElementsToReplace) {
        numElementsToReplace = numElementsToReplace || 1;
        let parent = parentStackNode.node;
        let parentProperty = parentStackNode.propertyName;
        if (!parent) {
            return;
        }
        
        if (parent[parentProperty].constructor.name == "Array") {
            // Replace Sequence statement with it's content nodes
            let pos = parentStackNode.index; // parent[parentProperty].indexOf(node);
            let params = [pos, numElementsToReplace].concat(newNode);
            parent[parentProperty].splice.apply(parent[parentProperty], params);
        } else {
            parent[parentProperty] = newNode;
        }
    }

    static removeChildFromParentNode(node) {
        let parent = node.parentNode;
        let parentProperty = node.parentNodeProperty;
        if (!parent) {
            return;
        }
        
        if (parent[parentProperty].constructor.name == "Array") {
            let pos = parent[parentProperty].indexOf(node);
            parent[parentProperty].splice(pos, 1);
        } else {
            delete parent[parentProperty];
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
                    return e;
                } else {
                    return n;
                }
            });
        } else if (!t.isExpressionStatement(arr)) {
            let e = t.expressionStatement(arr);
            expressions = [e];
        } else {
            expressions = [arr];
        }
        let blockNode = t.blockStatement(expressions);
        return blockNode;
    }

    static findNodeScope(node, parentStack) {
        let scope = null;
        let topNode = node;
        let parentStackIndex = parentStack.length - 1;

        if (!global.astScopes) {
            return null;
        }

        while (topNode && parentStackIndex >= 0) {
            if (topNode._state_id) {
                scope = global.astScopes[topNode._state_id];
                break;
            }
            while (parentStack[parentStackIndex].node == topNode) parentStackIndex--;
            topNode = parentStack[parentStackIndex--].node;
        }
        return scope;
    }

    static findVariableOnScope(node, varName, parentStack) {
        let scope = this.findNodeScope(node, parentStack);
        if (scope) {
            let variable = scope.getVariable(varName);
            if (variable) {
                return variable;
            }
        }
        return null;
    }

    static findFunctionOnScope(node, funcName, parentStack) {
        let funcVar = this.findVariableOnScope(node, funcName, parentStack);
        if (funcVar && funcVar.value?.constructor?.name == "Function") {
            return funcVar.value;
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
            return this.extractVariableParts(node.object)?.concat(this.extractVariableParts(node.property));
        } else if (node.type == "ThisExpression") {
            return ["this"];
        } else if (node.type == "AssignmentExpression") {
            return this.extractVariableParts(node.left);
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