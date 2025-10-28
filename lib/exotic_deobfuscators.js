/**
 * Exotic JavaScript obfuscators detector and decoder
 * Supports: JSFuck, Packer, AAEncode, JJEncode
 */

const parser = require('@babel/parser');

/**
 * Detect JSFuck obfuscation
 * JSFuck uses only 6 characters: []()!+
 * Example: (![]+[])[+[]]+(![]+[])[!+[]+!+[]]...
 */
function detectJSFuck(code) {
    // Check if code consists primarily of JSFuck characters
    const jsfuckChars = /^[\[\]\(\)!+\s]+$/;
    const jsfuckOnly = code.replace(/\s/g, '');

    // Must be longer than 100 chars (JSFuck is very verbose)
    if (jsfuckOnly.length < 100) {
        return { detected: false };
    }

    // Check character distribution
    const totalChars = jsfuckOnly.length;
    const allowedChars = jsfuckOnly.match(/[\[\]\(\)!+]/g)?.length || 0;
    const percentage = (allowedChars / totalChars) * 100;

    if (percentage > 95) {
        return {
            detected: true,
            confidence: percentage / 100,
            type: 'JSFuck',
            description: 'Code uses only []()!+ characters',
            decodable: true
        };
    }

    return { detected: false };
}

/**
 * Decode JSFuck by evaluating in safe context
 */
function decodeJSFuck(code) {
    try {
        // JSFuck is valid JavaScript, just eval it in VM
        const vm = require('vm');
        const result = vm.runInNewContext(code, {}, {
            timeout: 5000,
            displayErrors: false
        });

        // If result is a string, it's likely the decoded code
        if (typeof result === 'string') {
            return {
                success: true,
                decoded: result,
                method: 'vm.runInNewContext'
            };
        }

        // If result is a function, try to get its source
        if (typeof result === 'function') {
            return {
                success: true,
                decoded: result.toString(),
                method: 'function.toString'
            };
        }

        return {
            success: false,
            error: 'Unexpected result type: ' + typeof result
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Detect Dean Edwards' Packer obfuscation
 * Pattern: eval(function(p,a,c,k,e,d){...}(args).split('|'))
 */
function detectPacker(code) {
    // Look for Packer signature
    const packerPattern = /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*,\s*d\s*\)/;
    const packerPattern2 = /return p}\('.*?',(\d+),(\d+),'(.*?)'\.split\('\|'\)/;

    if (packerPattern.test(code)) {
        // Check for split('|') which is characteristic of Packer
        const hasSplit = /\.split\(['"][\|]['"]/.test(code);
        const hasBase62 = /while\s*\(\s*c\s*--\s*\)\s*\{/.test(code);

        if (hasSplit) {
            return {
                detected: true,
                confidence: hasBase62 ? 0.95 : 0.85,
                type: 'Packer',
                description: "Dean Edwards' Packer (base62 encoding)",
                decodable: true
            };
        }
    }

    return { detected: false };
}

/**
 * Decode Dean Edwards' Packer
 */
function decodePacker(code) {
    try {
        // Extract the packed function and its arguments
        const match = code.match(/eval\s*\(\s*function\s*\(p,a,c,k,e,d\)\s*\{[\s\S]*?\}\s*\((.*?)\)\s*\)/);

        if (!match) {
            return {
                success: false,
                error: 'Could not extract packer payload'
            };
        }

        // Eval the packer to decode
        const vm = require('vm');

        // Replace eval with return to get the unpacked code
        const unpackerCode = code.replace(/^eval\s*\(/, 'return (');
        const wrappedCode = `(function() { ${unpackerCode} })()`;

        const decoded = vm.runInNewContext(wrappedCode, {}, {
            timeout: 5000,
            displayErrors: false
        });

        if (typeof decoded === 'string') {
            return {
                success: true,
                decoded: decoded,
                method: 'packer-eval'
            };
        }

        return {
            success: false,
            error: 'Unpacked result is not a string'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Detect AAEncode obfuscation
 * AAEncode uses Japanese emoticons and specific patterns
 * Signature: ﾟωﾟﾉ= /｀ｍ´）ノ ~┻━┻
 */
function detectAAEncode(code) {
    // Look for AAEncode signature
    const aaencodeSignatures = [
        /ﾟωﾟﾉ\s*=/,
        /ﾟДﾟ/,
        /ﾟΘﾟ/,
        /\(ﾟДﾟ\)\s*\[ﾟΘﾟ\]/,
        /\/\*´∇｀\*\//
    ];

    let matchCount = 0;
    for (const pattern of aaencodeSignatures) {
        if (pattern.test(code)) {
            matchCount++;
        }
    }

    if (matchCount >= 2) {
        return {
            detected: true,
            confidence: Math.min(0.9, 0.5 + (matchCount * 0.1)),
            type: 'AAEncode',
            description: 'Japanese emoticon-based encoding',
            decodable: true
        };
    }

    return { detected: false };
}

/**
 * Decode AAEncode
 */
function decodeAAEncode(code) {
    try {
        // AAEncode is valid JavaScript that evaluates to the original code
        const vm = require('vm');

        // Run in VM to get decoded string
        const decoded = vm.runInNewContext(code, {}, {
            timeout: 5000,
            displayErrors: false
        });

        if (typeof decoded === 'string') {
            return {
                success: true,
                decoded: decoded,
                method: 'vm.runInNewContext'
            };
        }

        return {
            success: false,
            error: 'Decoded result is not a string'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Detect JJEncode obfuscation
 * JJEncode uses only symbols and Japanese characters
 */
function detectJJEncode(code) {
    // JJEncode signature
    const jjencodePattern = /\$=~\[\];/;
    const hasJJSignature = jjencodePattern.test(code);

    if (hasJJSignature) {
        // Check for characteristic patterns
        const hasSymbols = /[\$_]+\[\$[\$_]+\]/.test(code);

        if (hasSymbols) {
            return {
                detected: true,
                confidence: 0.9,
                type: 'JJEncode',
                description: 'Symbol-based encoding with Japanese characters',
                decodable: true
            };
        }
    }

    return { detected: false };
}

/**
 * Decode JJEncode
 */
function decodeJJEncode(code) {
    try {
        const vm = require('vm');

        // JJEncode evaluates to a string
        const decoded = vm.runInNewContext(code, {}, {
            timeout: 5000,
            displayErrors: false
        });

        if (typeof decoded === 'string') {
            return {
                success: true,
                decoded: decoded,
                method: 'vm.runInNewContext'
            };
        }

        return {
            success: false,
            error: 'Decoded result is not a string'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Detect URLEncode obfuscation
 * Uses escape/unescape with URL encoding
 */
function detectURLEncode(code) {
    const unescapePattern = /unescape\s*\(\s*['"][%0-9A-Fa-f]+['"]\s*\)/;
    const evalUnescapePattern = /eval\s*\(\s*unescape\s*\(/;

    if (evalUnescapePattern.test(code)) {
        return {
            detected: true,
            confidence: 0.95,
            type: 'URLEncode',
            description: 'URL-encoded with unescape()',
            decodable: true
        };
    }

    if (unescapePattern.test(code)) {
        return {
            detected: true,
            confidence: 0.85,
            type: 'URLEncode',
            description: 'Contains URL-encoded strings',
            decodable: true
        };
    }

    return { detected: false };
}

/**
 * Decode URL encoding
 */
function decodeURLEncode(code) {
    try {
        // If it's eval(unescape(...)), extract and decode
        const evalUnescapePattern = /^\s*eval\s*\(\s*unescape\s*\(/;

        if (evalUnescapePattern.test(code)) {
            // Replace eval with return to get the decoded string
            const modified = code.replace(/^\s*eval\s*\(/, '(function() { return ');
            const wrapped = modified + ' })()';

            try {
                const vm = require('vm');
                const decoded = vm.runInNewContext(wrapped, {}, {
                    timeout: 5000,
                    displayErrors: false
                });

                if (typeof decoded === 'string') {
                    return {
                        success: true,
                        decoded: decoded,
                        method: 'vm.runInNewContext'
                    };
                }
            } catch (vmErr) {
                // If VM fails, fall through to regex method
            }
        }

        // Extract unescape() calls and decode them
        const unescapePattern = /unescape\s*\(\s*(['"])([%0-9A-Fa-f]+)\1\s*\)/g;

        let decoded = code;
        let match;
        let changes = 0;

        while ((match = unescapePattern.exec(code)) !== null) {
            const encoded = match[2];
            const decodedStr = decodeURIComponent(encoded);
            // Escape quotes in decoded string
            const escapedStr = decodedStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
            decoded = decoded.replace(match[0], `"${escapedStr}"`);
            changes++;
        }

        if (changes > 0) {
            return {
                success: true,
                decoded: decoded,
                method: 'decodeURIComponent',
                changes: changes
            };
        }

        return {
            success: false,
            error: 'No unescape() calls found'
        };
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
}

/**
 * Main detection function - runs all detectors
 */
function detectExoticObfuscation(code) {
    const detectors = [
        detectJSFuck,
        detectPacker,
        detectAAEncode,
        detectJJEncode,
        detectURLEncode
    ];

    const results = [];

    for (const detector of detectors) {
        const result = detector(code);
        if (result.detected) {
            results.push(result);
        }
    }

    if (results.length === 0) {
        return {
            detected: false,
            types: []
        };
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);

    return {
        detected: true,
        types: results,
        primary: results[0]
    };
}

/**
 * Main decoding function - tries appropriate decoder
 */
function decodeExoticObfuscation(code, type) {
    const decoders = {
        'JSFuck': decodeJSFuck,
        'Packer': decodePacker,
        'AAEncode': decodeAAEncode,
        'JJEncode': decodeJJEncode,
        'URLEncode': decodeURLEncode
    };

    if (!decoders[type]) {
        return {
            success: false,
            error: `No decoder available for type: ${type}`
        };
    }

    console.log(`[Exotic] Attempting to decode ${type}...`);
    const result = decoders[type](code);

    if (result.success) {
        console.log(`[Exotic] Successfully decoded ${type} (${result.decoded.length} chars)`);
    } else {
        console.log(`[Exotic] Failed to decode ${type}: ${result.error}`);
    }

    return result;
}

module.exports = {
    detectExoticObfuscation,
    decodeExoticObfuscation,
    detectJSFuck,
    detectPacker,
    detectAAEncode,
    detectJJEncode,
    detectURLEncode
};
