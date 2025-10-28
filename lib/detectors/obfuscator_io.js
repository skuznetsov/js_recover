/**
 * Obfuscator.io Pattern Detector
 *
 * Detects characteristic patterns of obfuscator.io obfuscation:
 * 1. String array rotation pattern
 * 2. Control flow flattening
 * 3. Dead code injection
 *
 * These patterns are added to the malware report as "Obfuscation Detected"
 */

const t = require('@babel/types');

/**
 * Detect string array rotation pattern
 *
 * Pattern:
 *   var _0x1234 = ['str1', 'str2', 'str3'];
 *   (function(_0xabc, _0xdef) {
 *     var _0xghi = function(_0xabc) {
 *       while (--_0xabc) {
 *         _0xdef['push'](_0xdef['shift']());
 *       }
 *     };
 *     _0xghi(++_0xabc);
 *   }(_0x1234, 0x123));
 *
 * Returns detection confidence and details
 */
function detectStringArrayRotation(ast) {
    const detections = [];
    let stringArrays = [];
    let rotationFunctions = [];

    // Traverse AST to find patterns
    function traverse(node, depth = 0) {
        if (!node || typeof node !== 'object' || depth > 50) return;

        // Pattern 1: Large string array declaration
        // var _0x1234 = ['str1', 'str2', ...];
        if (node.type === 'VariableDeclarator' &&
            node.init &&
            node.init.type === 'ArrayExpression' &&
            node.init.elements.length > 10 &&
            node.init.elements.every(el => el && el.type === 'StringLiteral')) {

            const varName = node.id.name;

            // Check for obfuscated naming pattern (_0x[a-f0-9]+)
            if (/^_0x[a-f0-9]+$/i.test(varName)) {
                stringArrays.push({
                    name: varName,
                    size: node.init.elements.length,
                    line: node.loc?.start.line
                });
            }
        }

        // Pattern 2: Rotation function
        // (function(_0xabc, _0xdef) { ... }(_0x1234, 0x123))
        if (node.type === 'CallExpression' &&
            node.callee.type === 'FunctionExpression' &&
            node.callee.params.length === 2) {

            const bodyCode = JSON.stringify(node.callee.body);

            // Check for rotation pattern markers
            const hasWhileLoop = /"type":"WhileExpression"/.test(bodyCode) ||
                                /"type":"WhileStatement"/.test(bodyCode);
            const hasPushShift = /"push"/.test(bodyCode) && /"shift"/.test(bodyCode);
            const hasDecrement = /"operator":"--"/.test(bodyCode);

            if (hasWhileLoop && hasPushShift && hasDecrement) {
                rotationFunctions.push({
                    params: node.callee.params.map(p => p.name),
                    line: node.loc?.start.line
                });
            }
        }

        // Recurse into child nodes
        for (const key in node) {
            if (key === 'loc' || key === 'comments') continue;
            const child = node[key];

            if (Array.isArray(child)) {
                child.forEach(c => traverse(c, depth + 1));
            } else if (child && typeof child === 'object') {
                traverse(child, depth + 1);
            }
        }
    }

    traverse(ast);

    // Analyze findings
    if (stringArrays.length > 0 && rotationFunctions.length > 0) {
        detections.push({
            pattern: 'String Array Rotation',
            confidence: 'high',
            severity: 'INFO',
            description: `Detected ${stringArrays.length} obfuscated string arrays with rotation functions`,
            details: {
                stringArrays: stringArrays.slice(0, 3), // Top 3
                rotationFunctions: rotationFunctions.length
            },
            tool: 'obfuscator.io (likely)'
        });
    } else if (stringArrays.length > 0) {
        detections.push({
            pattern: 'String Array',
            confidence: 'medium',
            severity: 'INFO',
            description: `Detected ${stringArrays.length} obfuscated string arrays (no rotation found)`,
            details: {
                stringArrays: stringArrays.slice(0, 3)
            },
            tool: 'obfuscator.io or similar'
        });
    }

    return detections;
}

/**
 * Detect control flow flattening pattern
 *
 * Pattern:
 *   while (true) {
 *     switch (_0x123) {
 *       case '0':
 *         ...;
 *         _0x123 = '1';
 *         continue;
 *       case '1':
 *         ...;
 *         _0x123 = '2';
 *         continue;
 *     }
 *     break;
 *   }
 *
 * Returns detection confidence and details
 */
function detectControlFlowFlattening(ast) {
    const detections = [];
    let flattenedBlocks = [];

    function traverse(node, depth = 0) {
        if (!node || typeof node !== 'object' || depth > 50) return;

        // Pattern: while(true) { switch(...) { ... } }
        if (node.type === 'WhileStatement') {
            // Check if condition is always true
            const isInfinite = node.test.type === 'BooleanLiteral' && node.test.value === true;

            // Check if body contains switch statement
            let hasSwitchStatement = false;
            let switchCases = 0;
            let hasContinue = false;
            let hasStringCases = false;

            if (node.body.type === 'BlockStatement') {
                for (const stmt of node.body.body) {
                    if (stmt.type === 'SwitchStatement') {
                        hasSwitchStatement = true;
                        switchCases = stmt.cases.length;

                        // Check if cases use string discriminants (obfuscator.io pattern)
                        hasStringCases = stmt.cases.some(c =>
                            c.test && c.test.type === 'StringLiteral'
                        );

                        // Check for continue statements in cases
                        const bodyCode = JSON.stringify(stmt.cases);
                        hasContinue = /"type":"ContinueStatement"/.test(bodyCode);
                    }
                }
            }

            if (isInfinite && hasSwitchStatement && hasContinue && switchCases >= 5) {
                flattenedBlocks.push({
                    line: node.loc?.start.line,
                    cases: switchCases,
                    stringCases: hasStringCases
                });
            }
        }

        // Recurse
        for (const key in node) {
            if (key === 'loc' || key === 'comments') continue;
            const child = node[key];

            if (Array.isArray(child)) {
                child.forEach(c => traverse(c, depth + 1));
            } else if (child && typeof child === 'object') {
                traverse(child, depth + 1);
            }
        }
    }

    traverse(ast);

    if (flattenedBlocks.length > 0) {
        const totalCases = flattenedBlocks.reduce((sum, b) => sum + b.cases, 0);
        const hasStringCases = flattenedBlocks.some(b => b.stringCases);

        detections.push({
            pattern: 'Control Flow Flattening',
            confidence: hasStringCases ? 'high' : 'medium',
            severity: 'INFO',
            description: `Detected ${flattenedBlocks.length} flattened control flow blocks (${totalCases} cases total)`,
            details: {
                blocks: flattenedBlocks.length,
                totalCases: totalCases,
                stringCases: hasStringCases
            },
            tool: 'obfuscator.io (likely)'
        });
    }

    return detections;
}

/**
 * Detect dead code injection pattern
 *
 * Simple heuristic: functions that are never called with suspicious patterns
 */
function detectDeadCodeInjection(ast, processingContext) {
    const detections = [];

    // This would require call graph analysis
    // For now, just detect obvious patterns like:
    // - Many functions with 0 call count
    // - Functions with identical structure

    const scopes = processingContext.astScopes || {};
    let zeroCalls = 0;
    let totalFuncs = 0;

    Object.values(scopes).forEach(scope => {
        if (!scope.variables) return;

        Object.values(scope.variables).forEach(variable => {
            if (variable.value && variable.value.constructor?.name === 'Function') {
                totalFuncs++;
                if ((variable.value.callCount || 0) === 0) {
                    zeroCalls++;
                }
            }
        });
    });

    // High ratio of uncalled functions suggests dead code injection
    if (totalFuncs > 10 && zeroCalls / totalFuncs > 0.3) {
        detections.push({
            pattern: 'Dead Code Injection',
            confidence: 'medium',
            severity: 'INFO',
            description: `${zeroCalls}/${totalFuncs} functions are never called (${Math.round(zeroCalls/totalFuncs*100)}%)`,
            details: {
                uncalledFunctions: zeroCalls,
                totalFunctions: totalFuncs,
                ratio: Math.round(zeroCalls/totalFuncs*100)
            },
            tool: 'obfuscator.io or code bloating'
        });
    }

    return detections;
}

/**
 * Main detector function
 * Returns array of detected obfuscation patterns
 */
function detectObfuscatorIO(ast, processingContext) {
    const detections = [];

    try {
        // Run all detectors
        detections.push(...detectStringArrayRotation(ast));
        detections.push(...detectControlFlowFlattening(ast));
        detections.push(...detectDeadCodeInjection(ast, processingContext));
    } catch (err) {
        console.error('[Obfuscator.io Detector] Error:', err.message);
    }

    return detections;
}

module.exports = {
    detectObfuscatorIO,
    detectStringArrayRotation,
    detectControlFlowFlattening,
    detectDeadCodeInjection
};
