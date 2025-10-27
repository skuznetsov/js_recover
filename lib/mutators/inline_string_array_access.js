const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Inline String Array Access
 *
 * Detects and inlines common string array obfuscation patterns:
 *
 * Pattern:
 *   var arr = ['str1', 'str2', 'str3'];
 *   var accessor = function(i) { return arr[i]; };
 *   usage: accessor(0) → 'str1'
 *
 * This mutator inlines the function calls, then constant folding
 * will evaluate arr[0] → 'str1'.
 */

/**
 * Check if a function is a string array accessor
 *
 * Returns the array name if it matches the pattern:
 *   function(param) { return arrayName[param]; }
 */
function isStringArrayAccessor(funcNode) {
    if (!funcNode || funcNode.type !== 'FunctionExpression') {
        return null;
    }

    // Must have exactly 1 parameter
    if (!funcNode.params || funcNode.params.length !== 1) {
        return null;
    }

    const paramName = funcNode.params[0].name;

    // Body must be a single return statement
    if (!funcNode.body || funcNode.body.type !== 'BlockStatement') {
        return null;
    }

    const statements = funcNode.body.body;
    if (statements.length !== 1 || statements[0].type !== 'ReturnStatement') {
        return null;
    }

    const returnArg = statements[0].argument;

    // Return value must be: arrayName[param] or wrappedCall(arrayName[param])
    let memberExpr = returnArg;

    // Handle wrapper functions like atob(arr[i])
    if (returnArg.type === 'CallExpression' && returnArg.arguments.length === 1) {
        memberExpr = returnArg.arguments[0];
    }

    if (memberExpr.type !== 'MemberExpression') {
        return null;
    }

    // Must be computed: arr[param]
    if (!memberExpr.computed) {
        return null;
    }

    // Property must be the parameter
    if (memberExpr.property.type !== 'Identifier' ||
        memberExpr.property.name !== paramName) {
        return null;
    }

    // Object must be an identifier (the array name)
    if (memberExpr.object.type !== 'Identifier') {
        return null;
    }

    return {
        arrayName: memberExpr.object.name,
        paramName: paramName,
        hasWrapper: returnArg !== memberExpr,
        wrapperFunc: returnArg !== memberExpr ? returnArg.callee : null
    };
}

/**
 * Main mutator: Inline string array accessor calls
 */
function inlineStringArrayAccess(node, opts, parentStack) {
    if (!node || node.type !== 'CallExpression') {
        return false;
    }

    // Callee must be an identifier (the accessor function name)
    if (node.callee.type !== 'Identifier') {
        return false;
    }

    const funcName = node.callee.name;

    // Must have exactly 1 argument (the index)
    if (node.arguments.length !== 1) {
        return false;
    }

    const indexArg = node.arguments[0];

    // For now, only handle numeric literals and simple expressions
    // Constant folding will handle complex expressions later
    if (indexArg.type !== 'NumericLiteral' &&
        indexArg.type !== 'BinaryExpression') {
        return false;
    }

    // Look up the function in scopes
    const scope = Utils.findNodeScope(node, parentStack, opts);
    if (!scope) {
        return false;
    }

    const variable = scope.getVariable(funcName);
    if (!variable || !variable.value) {
        return false;
    }

    // Check if it's a string array accessor
    let funcNode = null;

    // Function might be in variable.definers
    if (variable.definers && variable.definers.length > 0) {
        const definer = variable.definers[0];
        if (definer.type === 'VariableDeclarator' && definer.init) {
            funcNode = definer.init;
        }
    }

    if (!funcNode) {
        return false;
    }

    const pattern = isStringArrayAccessor(funcNode);
    if (!pattern) {
        return false;
    }

    // Inline the access: accessor(i) → arrayName[i]
    const memberExpr = t.memberExpression(
        t.identifier(pattern.arrayName),
        indexArg,
        true  // computed
    );

    // If there's a wrapper function, wrap the result
    let replacement;
    if (pattern.hasWrapper) {
        replacement = t.callExpression(
            pattern.wrapperFunc,
            [memberExpr]
        );
    } else {
        replacement = memberExpr;
    }

    // Replace the call with the inlined expression
    Utils.replaceChildInParentNode(replacement, parentStack.last(), 0);

    return true;
}

module.exports = inlineStringArrayAccess;
