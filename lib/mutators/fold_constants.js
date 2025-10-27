const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Constant Folding Mutator
 *
 * Evaluates constant expressions at compile time:
 * - Arithmetic: 2 + 3 → 5, 10 * 2 → 20
 * - String concatenation: "hello" + "world" → "helloworld"
 * - Unary operations: -42, +5, ~3
 * - Boolean operations: true && false → false
 *
 * MUST use bottom-up traversal (children simplified first)
 */

/**
 * Safely evaluate binary operation
 * Returns null if operation cannot be folded
 */
function evaluateBinaryExpression(operator, left, right) {
    try {
        // Numeric operations
        if (typeof left === 'number' && typeof right === 'number') {
            switch (operator) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/':
                    if (right === 0) return null; // Avoid division by zero
                    return left / right;
                case '%':
                    if (right === 0) return null;
                    return left % right;
                case '**': return left ** right;
                case '<<': return left << right;
                case '>>': return left >> right;
                case '>>>': return left >>> right;
                case '|': return left | right;
                case '&': return left & right;
                case '^': return left ^ right;

                // Comparison operations
                case '<': return left < right;
                case '<=': return left <= right;
                case '>': return left > right;
                case '>=': return left >= right;
                case '==': return left == right;
                case '!=': return left != right;
                case '===': return left === right;
                case '!==': return left !== right;

                default: return null;
            }
        }

        // String concatenation
        if (operator === '+' && (typeof left === 'string' || typeof right === 'string')) {
            return String(left) + String(right);
        }

        // Boolean operations
        if (typeof left === 'boolean' && typeof right === 'boolean') {
            switch (operator) {
                case '&&': return left && right;
                case '||': return left || right;
                case '==': return left == right;
                case '!=': return left != right;
                case '===': return left === right;
                case '!==': return left !== right;
                default: return null;
            }
        }

        return null;
    } catch (e) {
        // Safety: if evaluation throws, don't fold
        return null;
    }
}

/**
 * Safely evaluate unary operation
 */
function evaluateUnaryExpression(operator, argument) {
    try {
        if (typeof argument === 'number') {
            switch (operator) {
                case '+': return +argument;
                case '-': return -argument;
                case '~': return ~argument;
                default: return null;
            }
        }

        if (typeof argument === 'boolean' && operator === '!') {
            return !argument;
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Extract literal value from AST node
 */
function getLiteralValue(node) {
    if (t.isNumericLiteral(node)) {
        return node.value;
    }
    if (t.isStringLiteral(node)) {
        return node.value;
    }
    if (t.isBooleanLiteral(node)) {
        return node.value;
    }
    if (t.isNullLiteral(node)) {
        return null;
    }
    return undefined; // Not a literal
}

/**
 * Create AST node from JavaScript value
 */
function createLiteralNode(value) {
    if (typeof value === 'number') {
        return t.numericLiteral(value);
    }
    if (typeof value === 'string') {
        return t.stringLiteral(value);
    }
    if (typeof value === 'boolean') {
        return t.booleanLiteral(value);
    }
    if (value === null) {
        return t.nullLiteral();
    }
    return null;
}

/**
 * Main mutator function
 * MUST be used with bottom-up traversal
 */
function foldConstants(node, opts, parentStack) {
    let parentNode = parentStack.last();

    if (!parentNode) {
        return false;
    }

    // Fold BinaryExpression (e.g., 2 + 3 → 5)
    if (t.isBinaryExpression(node)) {
        const leftValue = getLiteralValue(node.left);
        const rightValue = getLiteralValue(node.right);

        if (leftValue !== undefined && rightValue !== undefined) {
            const result = evaluateBinaryExpression(node.operator, leftValue, rightValue);

            if (result !== null && result !== undefined) {
                const newNode = createLiteralNode(result);

                if (newNode) {
                    if (opts.config.verbose) {
                        console.log(`Folding constant: ${leftValue} ${node.operator} ${rightValue} → ${result}`);
                    }

                    Utils.replaceChildInParentNode(newNode, parentNode);
                    return true;
                }
            }
        }
    }

    // Fold UnaryExpression (e.g., -42, !true)
    if (t.isUnaryExpression(node)) {
        const argValue = getLiteralValue(node.argument);

        if (argValue !== undefined) {
            const result = evaluateUnaryExpression(node.operator, argValue);

            if (result !== null && result !== undefined) {
                const newNode = createLiteralNode(result);

                if (newNode) {
                    if (opts.config.verbose) {
                        console.log(`Folding constant: ${node.operator}${argValue} → ${result}`);
                    }

                    Utils.replaceChildInParentNode(newNode, parentNode);
                    return true;
                }
            }
        }
    }

    // Fold LogicalExpression with literal operands
    if (t.isLogicalExpression(node)) {
        const leftValue = getLiteralValue(node.left);
        const rightValue = getLiteralValue(node.right);

        // Short-circuit evaluation
        if (leftValue !== undefined) {
            if (node.operator === '&&') {
                // false && X → false
                if (!leftValue) {
                    if (opts.config.verbose) {
                        console.log(`Folding logical: ${leftValue} && ... → ${leftValue}`);
                    }
                    Utils.replaceChildInParentNode(t.booleanLiteral(false), parentNode);
                    return true;
                }
                // true && X → X (if X is literal)
                if (leftValue && rightValue !== undefined) {
                    if (opts.config.verbose) {
                        console.log(`Folding logical: true && ${rightValue} → ${rightValue}`);
                    }
                    const newNode = createLiteralNode(rightValue);
                    if (newNode) {
                        Utils.replaceChildInParentNode(newNode, parentNode);
                        return true;
                    }
                }
            } else if (node.operator === '||') {
                // true || X → true
                if (leftValue) {
                    if (opts.config.verbose) {
                        console.log(`Folding logical: ${leftValue} || ... → ${leftValue}`);
                    }
                    Utils.replaceChildInParentNode(t.booleanLiteral(true), parentNode);
                    return true;
                }
                // false || X → X (if X is literal)
                if (!leftValue && rightValue !== undefined) {
                    if (opts.config.verbose) {
                        console.log(`Folding logical: false || ${rightValue} → ${rightValue}`);
                    }
                    const newNode = createLiteralNode(rightValue);
                    if (newNode) {
                        Utils.replaceChildInParentNode(newNode, parentNode);
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

module.exports = foldConstants;
