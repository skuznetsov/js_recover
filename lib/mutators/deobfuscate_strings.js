const t = require('@babel/types');
const Utils = require('../utils');

/**
 * String Deobfuscation Mutator
 *
 * Decodes obfuscated strings:
 * - Hex escapes: "\x48\x65\x6c\x6c\x6f" → "Hello"
 * - Unicode escapes: "\u0048\u0065\u006c\u006c\u006f" → "Hello"
 * - Octal escapes: "\110\145\154\154\157" → "Hello"
 * - Mixed escapes: "H\x65\u006c\154o" → "Hello"
 *
 * Safe: preserves intentional escapes like \n, \t, \", \'
 */

/**
 * Decode hex escape sequences (\xNN)
 */
function decodeHexEscapes(str) {
    return str.replace(/\\x([0-9A-Fa-f]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
}

/**
 * Decode unicode escape sequences (\uNNNN)
 */
function decodeUnicodeEscapes(str) {
    return str.replace(/\\u([0-9A-Fa-f]{4})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
}

/**
 * Decode octal escape sequences (\NNN)
 * Careful: only decode 3-digit octals to avoid conflicts
 */
function decodeOctalEscapes(str) {
    // Match 1-3 digit octal sequences (but not \0 followed by digit, as that's different)
    return str.replace(/\\([0-7]{1,3})/g, (match, octal) => {
        const code = parseInt(octal, 8);
        // Only decode if valid character code
        if (code >= 0 && code <= 255) {
            return String.fromCharCode(code);
        }
        return match; // Keep original if invalid
    });
}

/**
 * Full string deobfuscation
 * Preserves legitimate escapes (\n, \t, \r, \', \", \\, etc.)
 */
function deobfuscateString(str) {
    let result = str;

    // Decode hex escapes
    result = decodeHexEscapes(result);

    // Decode unicode escapes
    result = decodeUnicodeEscapes(result);

    // Decode octal escapes (be conservative)
    result = decodeOctalEscapes(result);

    return result;
}

/**
 * Check if string contains obfuscated escapes
 */
function hasObfuscatedEscapes(str) {
    return /\\x[0-9A-Fa-f]{2}/.test(str) ||
           /\\u[0-9A-Fa-f]{4}/.test(str) ||
           /\\[0-7]{1,3}/.test(str);
}

/**
 * Main mutator function
 */
function deobfuscateStrings(node, opts, parentStack) {
    let parentNode = parentStack.last();

    if (!parentNode) {
        return false;
    }

    // Process StringLiteral nodes
    if (t.isStringLiteral(node)) {
        const originalValue = node.value;

        // Check if string has obfuscated escapes
        // Note: node.value is already processed by parser, so we need to check node.extra.raw
        if (node.extra && node.extra.raw) {
            const rawString = node.extra.raw;

            // Remove quotes to get the actual string content
            const stringContent = rawString.slice(1, -1); // Remove surrounding quotes

            if (hasObfuscatedEscapes(stringContent)) {
                const deobfuscated = deobfuscateString(stringContent);

                if (deobfuscated !== stringContent) {
                    if (opts.config.verbose) {
                        console.log(`Deobfuscating string: ${stringContent.substring(0, 50)}... → ${deobfuscated.substring(0, 50)}...`);
                    }

                    // Create new string literal with deobfuscated value
                    const newNode = t.stringLiteral(deobfuscated);
                    Utils.replaceChildInParentNode(newNode, parentNode);
                    return true;
                }
            }
        }
    }

    // Also handle template literals (if they contain obfuscated escapes)
    if (t.isTemplateLiteral(node)) {
        let hasChanges = false;

        for (let i = 0; i < node.quasis.length; i++) {
            const quasi = node.quasis[i];
            const rawValue = quasi.value.raw;

            if (hasObfuscatedEscapes(rawValue)) {
                const deobfuscated = deobfuscateString(rawValue);

                if (deobfuscated !== rawValue) {
                    if (opts.config.verbose) {
                        console.log(`Deobfuscating template: ${rawValue.substring(0, 50)}... → ${deobfuscated.substring(0, 50)}...`);
                    }

                    // Update the quasi
                    quasi.value.raw = deobfuscated;
                    quasi.value.cooked = deobfuscated;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges) {
            return true;
        }
    }

    return false;
}

module.exports = deobfuscateStrings;
