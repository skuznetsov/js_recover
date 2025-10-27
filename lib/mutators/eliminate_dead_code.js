const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Dead Code Elimination Mutator
 *
 * Removes unreachable code:
 * - if (false) { ... } → (removed)
 * - if (true) { ... } else { ... } → { ... } (removes else)
 * - while (false) { ... } → (removed)
 * - Statements after return/throw/break/continue
 *
 * MUST use bottom-up traversal (children simplified first by constant folding)
 */

/**
 * Check if node is a literal true value
 */
function isTruthy(node) {
    if (t.isBooleanLiteral(node)) {
        return node.value === true;
    }
    if (t.isNumericLiteral(node)) {
        return node.value !== 0;
    }
    if (t.isStringLiteral(node)) {
        return node.value !== '';
    }
    return false;
}

/**
 * Check if node is a literal false value
 */
function isFalsy(node) {
    if (t.isBooleanLiteral(node)) {
        return node.value === false;
    }
    if (t.isNumericLiteral(node)) {
        return node.value === 0;
    }
    if (t.isStringLiteral(node)) {
        return node.value === '';
    }
    if (t.isNullLiteral(node)) {
        return true;
    }
    return false;
}

/**
 * Check if statement is a control flow terminator
 */
function isTerminator(node) {
    return t.isReturnStatement(node) ||
           t.isThrowStatement(node) ||
           t.isBreakStatement(node) ||
           t.isContinueStatement(node);
}

/**
 * Remove unreachable statements after terminator
 */
function removeUnreachableCode(statements) {
    let hasChanges = false;

    for (let i = 0; i < statements.length - 1; i++) {
        const stmt = statements[i];

        if (isTerminator(stmt)) {
            // Everything after this is unreachable
            const removedCount = statements.length - i - 1;

            if (removedCount > 0) {
                statements.splice(i + 1, removedCount);
                hasChanges = true;
                break;
            }
        }
    }

    return hasChanges;
}

/**
 * Main mutator function
 */
function eliminateDeadCode(node, opts, parentStack) {
    let parentNode = parentStack.last();

    if (!parentNode) {
        return false;
    }

    // Eliminate if (false) { ... }
    if (t.isIfStatement(node)) {
        if (isFalsy(node.test)) {
            if (opts.config.verbose) {
                console.log('Eliminating dead if: if (false) { ... }');
            }

            // Replace with alternate (if exists) or empty statement
            if (node.alternate) {
                Utils.replaceChildInParentNode(node.alternate, parentNode);
            } else {
                // Remove entire if statement
                Utils.replaceChildInParentNode(t.emptyStatement(), parentNode);
            }
            return true;
        }

        // Simplify if (true) { ... } else { ... }
        if (isTruthy(node.test)) {
            if (opts.config.verbose) {
                console.log('Simplifying if: if (true) { ... } → { ... }');
            }

            // Replace with consequent only
            Utils.replaceChildInParentNode(node.consequent, parentNode);
            return true;
        }
    }

    // Eliminate while (false) { ... }
    if (t.isWhileStatement(node)) {
        if (isFalsy(node.test)) {
            if (opts.config.verbose) {
                console.log('Eliminating dead while: while (false) { ... }');
            }

            Utils.replaceChildInParentNode(t.emptyStatement(), parentNode);
            return true;
        }
    }

    // Eliminate for (;false;) { ... }
    if (t.isForStatement(node)) {
        if (node.test && isFalsy(node.test)) {
            if (opts.config.verbose) {
                console.log('Eliminating dead for: for (...; false; ...) { ... }');
            }

            // Keep init if it has side effects, otherwise remove
            if (node.init && !t.isLiteral(node.init)) {
                Utils.replaceChildInParentNode(t.expressionStatement(node.init), parentNode);
            } else {
                Utils.replaceChildInParentNode(t.emptyStatement(), parentNode);
            }
            return true;
        }
    }

    // Remove unreachable code in block statements
    if (t.isBlockStatement(node)) {
        if (node.body && node.body.length > 0) {
            const hasChanges = removeUnreachableCode(node.body);

            if (hasChanges) {
                if (opts.config.verbose) {
                    console.log('Removed unreachable code after terminator');
                }
                return true;
            }
        }
    }

    // Remove empty block statements (but keep if it's a function body)
    if (t.isBlockStatement(node) && node.body.length === 0) {
        const parent = parentNode.node;

        // Don't remove if it's a function/constructor/method body
        if (!t.isFunction(parent) && !t.isMethod(parent)) {
            if (opts.config.verbose) {
                console.log('Removing empty block statement');
            }

            Utils.replaceChildInParentNode(t.emptyStatement(), parentNode);
            return true;
        }
    }

    // Eliminate conditional expression with constant test
    if (t.isConditionalExpression(node)) {
        if (isTruthy(node.test)) {
            if (opts.config.verbose) {
                console.log('Simplifying ternary: true ? X : Y → X');
            }

            Utils.replaceChildInParentNode(node.consequent, parentNode);
            return true;
        }

        if (isFalsy(node.test)) {
            if (opts.config.verbose) {
                console.log('Simplifying ternary: false ? X : Y → Y');
            }

            Utils.replaceChildInParentNode(node.alternate, parentNode);
            return true;
        }
    }

    return false;
}

module.exports = eliminateDeadCode;
