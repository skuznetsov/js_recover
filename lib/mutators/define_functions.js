const t = require('@babel/types');
const Utils = require('../utils');

// FIX P1-2: Use context instead of global state
// Removed: global.Functions = {};

function defineFunction(node, opts, parentStack) {
    // Initialize functions map in opts if not present
    if (!opts.functions) {
        opts.functions = {};
    }

    let parent = parentStack.last()?.node;

    if (node.type == "FunctionDeclaration" && node.id) {
        node.callCount = 0;
        // TODO: Check that it is not a class constructor
        // if it is a constructor it should have a variable of the same name defined somewhere on the scopes
        if (node.body.type == "BlockStatement" &&
            (
                node.body.body.length == 0 ||
                (
                    node.body.body.length == 1 &&
                    node.body.body[0].type == "ReturnStatement" &&
                    node.body.body[0].argument == null
                )
            )
        ) {
            node.isEmptyFunction = true;
        }
        let funcVar = Utils.findVariableOnScope(node, node.id.name, parentStack, opts);
        if (funcVar?.value?.definers[0] == node) {
            if (opts.config && opts.config.verbose) {
                console.log("Function already defined in scope");
            }
        }
        // Store in context-local functions map
        opts.functions[node.id.name] = node;
    } else if (node.type == "FunctionExpression" && node.parentNode?.type == "AssignmentExpression") {
        let functionName = Utils.extractVariableName(node.parentNode.left);
        node.callCount = 0;
        let definedNode = opts.functions[functionName];
        if (definedNode) {
            if (opts.config && opts.config.verbose) {
                console.error(`Function ${functionName} is about to be redefined. Deleting the node.`);
            }
            Utils.removeChildFromParentNode(definedNode);
        }
        opts.functions[functionName] = node;
    }

    return false;
}

module.exports = defineFunction;