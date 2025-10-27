const t = require('@babel/types');

/**
 * Simplify Property Access
 *
 * Converts bracket notation to dot notation where possible:
 *   obj['property'] → obj.property
 *   obj['method']() → obj.method()
 *
 * Only converts if the property name is a valid JavaScript identifier.
 *
 * Improves readability significantly in deobfuscated code.
 */

/**
 * Check if a string is a valid JavaScript identifier
 *
 * Note: In ES5+, reserved words ARE allowed as property names!
 * obj.class and obj.return are valid (only obj['class'] was needed in ES3)
 */
function isValidIdentifier(str) {
    if (typeof str !== 'string' || str.length === 0) {
        return false;
    }

    // Check if it matches identifier pattern: [a-zA-Z_$][a-zA-Z0-9_$]*
    // Reserved words are OK as property names in modern JS
    const identifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return identifierRegex.test(str);
}

/**
 * Simplify property access from bracket to dot notation
 */
function simplifyPropertyAccess(node, opts, parentStack) {
    if (!node || node.type !== 'MemberExpression') {
        return false;
    }

    // Only process computed property access: obj[...]
    if (!node.computed) {
        return false;
    }

    // Property must be a string literal
    if (node.property.type !== 'StringLiteral') {
        return false;
    }

    const propertyName = node.property.value;

    // Check if property name is a valid identifier
    if (!isValidIdentifier(propertyName)) {
        return false;
    }

    // Convert to dot notation
    node.computed = false;
    node.property = t.identifier(propertyName);

    return true;
}

module.exports = simplifyPropertyAccess;
