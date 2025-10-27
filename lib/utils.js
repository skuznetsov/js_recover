const fs = require('fs');
const t = require('@babel/types');
const ParentStack = require('./parent_stack');

class Utils {
    /**
     * Create a new AST node and inherit scope context from parent
     * Prevents "lost scope context" bug where new nodes have no _state_id
     *
     * @param {Function} factory - Function that creates the node (e.g., () => t.blockStatement([]))
     * @param {Object} parentNode - Parent node to inherit _state_id from
     * @param {Object} parentStack - Parent stack for scope lookup
     * @param {Object} context - Processing context
     * @returns {Object} New node with inherited scope context
     */
    static createNodeWithScope(factory, parentNode, parentStack, context) {
        const newNode = factory();

        // Inherit scope ID from parent or find via parent stack
        if (parentNode && parentNode._state_id) {
            newNode._state_id = parentNode._state_id;
        } else if (parentStack && context) {
            // Try to find scope via parent stack
            const scope = this.findNodeScope(parentNode, parentStack, context);
            if (scope && scope.node && scope.node._state_id) {
                newNode._state_id = scope.node._state_id;
            }
        }

        return newNode;
    }

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

    static findNodeScope(node, parentStack, context) {
        let scope = null;
        let topNode = node;

        if (!context || !context.astScopes) {
            return null;
        }

        // Check current node first
        if (topNode._state_id) {
            scope = context.astScopes[topNode._state_id];
            return scope;
        }

        // Walk up parent stack (linked list) to find scope
        let current = parentStack;
        while (current) {
            const parentItem = ParentStack.last(current);
            if (!parentItem) break;

            topNode = parentItem.node;

            // Skip if this is the same node we're starting from
            if (topNode && topNode._state_id && topNode !== node) {
                scope = context.astScopes[topNode._state_id];
                if (scope) break;
            }

            current = ParentStack.pop(current);
        }

        return scope;
    }

    static findVariableOnScope(node, varName, parentStack, context) {
        let scope = this.findNodeScope(node, parentStack, context);
        if (scope) {
            let variable = scope.getVariable(varName);
            if (variable) {
                return variable;
            }
        }
        return null;
    }

    static findFunctionOnScope(node, funcName, parentStack, context) {
        let funcVar = this.findVariableOnScope(node, funcName, parentStack, context);
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