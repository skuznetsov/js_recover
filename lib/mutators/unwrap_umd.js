const t = require('@babel/types');

/**
 * UMD WRAPPER UNWRAPPER
 *
 * Detects and unwraps UMD (Universal Module Definition) wrappers
 * that contain webpack bundles.
 *
 * Pattern:
 * !function umdWrapper(root, factory) {
 *   if (typeof exports === 'object' && typeof module === 'object')
 *     module.exports = factory();
 *   // ... more UMD checks
 * }(this, function() {
 *   return (webpack_bundle);  // <-- extract this
 * });
 */

/**
 * Checks if a function body contains UMD pattern checks
 */
function looksLikeUMD(func) {
    if (!func || func.type !== 'FunctionExpression') {
        return false;
    }
    if (func.params.length !== 2) {
        return false;
    }

    const bodyCode = JSON.stringify(func.body);

    // UMD indicators - check stringified AST
    const hasExportsCheck = /"exports"/.test(bodyCode);
    const hasModuleCheck = /"module"/.test(bodyCode);
    const hasDefineCheck = /"define"/.test(bodyCode);

    // Check if second parameter (factory function, whatever it's named) is called
    // Get second param name (could be "factory", "s", "f", etc.)
    const factoryParamName = func.params[1].name;
    // In stringified AST, function calls appear as {"type":"CallExpression","callee":{"type":"Identifier","name":"<paramName>"}}
    const factoryCallPattern = new RegExp(`"name":"${factoryParamName}".*?"type":"CallExpression"`);
    const hasFactoryCall = factoryCallPattern.test(bodyCode);

    // Need at least exports/module checks AND factory call
    return (hasExportsCheck || hasModuleCheck) && hasFactoryCall;
}

/**
 * Main mutator: unwrap UMD wrapper to expose inner webpack bundle
 */
function unwrapUMD(node, opts, parentStack) {
    // Look for UMD pattern: !function(root, factory) { ... }(this, factoryFunc)
    if (node.type !== 'UnaryExpression' || node.operator !== '!') {
        return false;
    }

    const callExpr = node.argument;
    if (!callExpr || callExpr.type !== 'CallExpression') {
        return false;
    }

    const callee = callExpr.callee;
    if (!looksLikeUMD(callee)) {
        return false;
    }

    // Check arguments: (this, factoryFunction)
    if (callExpr.arguments.length < 2) {
        return false;
    }

    const rootArg = callExpr.arguments[0];
    const factoryArg = callExpr.arguments[1];

    // First arg should be 'this' or similar
    if (rootArg.type !== 'ThisExpression' && rootArg.type !== 'Identifier') {
        return false;
    }

    // Second arg should be the factory function
    if (factoryArg.type !== 'FunctionExpression' && factoryArg.type !== 'ArrowFunctionExpression') {
        return false;
    }

    console.log('[UMD] Detected UMD wrapper, unwrapping...');

    // Extract factory body
    let factoryBody;
    if (factoryArg.body.type === 'BlockStatement') {
        // function() { return bundle; }
        // Look for return statement
        const returnStmt = factoryArg.body.body.find(stmt => stmt.type === 'ReturnStatement');
        if (returnStmt && returnStmt.argument) {
            factoryBody = returnStmt.argument;
        } else {
            // No return, use whole block
            factoryBody = factoryArg.body;
        }
    } else {
        // Arrow function: () => bundle
        factoryBody = factoryArg.body;
    }

    if (!factoryBody) {
        console.log('[UMD] Could not extract factory body');
        return false;
    }

    console.log('[UMD] Unwrapped UMD, exposing inner bundle for processing');

    // Replace UMD wrapper with inner content
    const parent = parentStack.last();
    if (parent && parent.node) {
        // Find which key contains our node
        for (const key in parent.node) {
            if (parent.node[key] === node) {
                parent.node[key] = factoryBody;
                return true;
            } else if (Array.isArray(parent.node[key])) {
                const idx = parent.node[key].indexOf(node);
                if (idx !== -1) {
                    parent.node[key][idx] = factoryBody;
                    return true;
                }
            }
        }
    }

    return false;
}

module.exports = unwrapUMD;
