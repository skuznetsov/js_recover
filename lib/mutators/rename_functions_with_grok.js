const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Grok-based Function Renaming
 *
 * Cost optimization strategies:
 * 1. Batch 10-15 functions per API call
 * 2. Send only function signature + first 10 lines of body
 * 3. Skip well-named functions (length > 10, camelCase)
 * 4. Use context from callCount and parameters
 */

/**
 * Extract function context for Grok analysis
 * COST OPTIMIZATION: Limit body to 10 lines max
 */
function extractFunctionContext(funcVariable, scope) {
    const func = funcVariable.value; // Function instance
    if (!func || !func.definers || func.definers.length === 0) {
        return null;
    }

    const funcNode = func.definers[0]; // FunctionDeclaration or FunctionExpression
    const funcName = Utils.extractVariableName(func._name);

    // Extract parameters
    const params = func._params.map(p => Utils.extractVariableName(p)).join(', ');

    // Extract body summary (first 10 lines only to save tokens)
    let bodySummary = '';
    if (funcNode.body) {
        try {
            const generate = require('@babel/generator').default;
            const bodyCode = generate(funcNode.body, { concise: true }).code;

            // Limit to first 10 lines (cost optimization)
            const lines = bodyCode.split('\n').slice(0, 10);
            bodySummary = lines.join('\n');
            if (bodyCode.split('\n').length > 10) {
                bodySummary += '\n  // ... (truncated)';
            }
        } catch (e) {
            bodySummary = '[code generation failed]';
        }
    }

    return {
        name: funcName,
        params: params,
        body: bodySummary,
        callCount: func.callCount || 0
    };
}

/**
 * Analyze functions with Grok (BATCHED for cost optimization)
 */
async function analyzeFunctionsWithGrok(functions, grok, opts) {
    if (functions.length === 0) return {};

    // Prepare function summaries
    const funcSummaries = functions.map(f => {
        const ctx = f.context;
        return {
            name: ctx.name,
            params: ctx.params,
            bodyPreview: ctx.body.substring(0, 300), // Limit preview
            callCount: ctx.callCount
        };
    });

    const prompt = `You are analyzing obfuscated JavaScript code. Suggest meaningful function names based on their implementation.

Functions to analyze:
${JSON.stringify(funcSummaries, null, 2)}

For each function, suggest:
1. A descriptive name (camelCase, max 30 chars)
2. Confidence level (high/medium/low)
3. Brief reason (1 sentence)

Rules:
- Keep original if already good (e.g., "handleClick", "processData")
- Use verb-based names (e.g., "encryptData" not "encryption")
- If unclear, use generic names (e.g., "processInput", "helper")
- Only rename if confidence is medium or high
- If malicious behavior detected, prefix with "MALWARE_" (e.g., "MALWARE_encryptFiles")

Respond in JSON:
{
  "renames": [
    {"old": "_0x1", "new": "encryptData", "confidence": "high", "reason": "creates cipher and encrypts data"},
    {"old": "func2", "new": "func2", "confidence": "low", "reason": "unclear purpose"}
  ]
}`;

    try {
        const content = await grok.generate([
            { role: 'user', content: prompt }
        ]);

        const analysis = JSON.parse(content);

        if (!analysis.renames || !Array.isArray(analysis.renames)) {
            console.error('[Grok] Invalid function analysis response format');
            return {};
        }

        // Convert to map: oldName -> newName
        const renameMap = {};
        analysis.renames.forEach(r => {
            if (r.old !== r.new && r.confidence !== 'low') {
                renameMap[r.old] = {
                    newName: r.new,
                    confidence: r.confidence,
                    reason: r.reason
                };
            }
        });

        return renameMap;

    } catch (error) {
        console.error('[Grok] Function analysis failed:', error.message);
        return {};
    }
}

/**
 * Check if function name is already good
 */
function isGoodFunctionName(name) {
    // Single letter or very short names are bad
    if (name.length <= 3) return false;

    // Common good patterns
    const goodPatterns = [
        /^(get|set|is|has|can|should|will)[A-Z]/, // getUser, isValid
        /^(handle|process|create|update|delete|fetch|load|save)[A-Z]/, // handleClick
        /^(on|before|after)[A-Z]/, // onClick, beforeLoad
        /^(init|setup|teardown|cleanup)[A-Z]?/, // initialize
    ];

    if (goodPatterns.some(pattern => pattern.test(name))) {
        return true;
    }

    // Long descriptive names (10+ chars with camelCase)
    if (name.length >= 10 && /[a-z][A-Z]/.test(name)) {
        return true;
    }

    // Common library function names
    const commonNames = [
        'constructor', 'toString', 'valueOf', 'hasOwnProperty',
        'addEventListener', 'querySelector', 'setTimeout', 'setInterval',
        'then', 'catch', 'finally', 'map', 'filter', 'reduce', 'forEach'
    ];

    if (commonNames.includes(name)) {
        return true;
    }

    return false;
}

/**
 * Main mutator - runs ONCE after scope analysis
 */
async function renameFunctionsWithGrok(node, opts, parentStack) {
    // Check if Grok is available
    if (!opts.grokInterface) {
        return false;
    }

    if (opts.config && opts.config.useGrokForFunctions === false) {
        return false;
    }

    // Only process Program or File node (run once)
    if (node.type !== 'Program' && node.type !== 'File') {
        return false;
    }

    // Check if already processed
    if (opts._grokFunctionsProcessed) {
        return false;
    }
    opts._grokFunctionsProcessed = true;

    console.log('[Grok] Starting function analysis...');

    const scopes = opts.astScopes || {};
    const allFunctions = [];

    // Collect all functions from all scopes
    Object.values(scopes).forEach(scope => {
        if (scope.variables) {
            Object.values(scope.variables).forEach(variable => {
                // Only process functions
                if (!variable.value || variable.value.constructor?.name !== 'Function') {
                    return;
                }

                // Skip functions with good names already
                if (isGoodFunctionName(variable.name)) {
                    return;
                }

                // Extract context
                const context = extractFunctionContext(variable, scope);
                if (!context) {
                    return;
                }

                allFunctions.push({
                    name: variable.name,
                    variable: variable,
                    func: variable.value,
                    context: context
                });
            });
        }
    });

    if (allFunctions.length === 0) {
        console.log('[Grok] No functions to analyze');
        return false;
    }

    console.log(`[Grok] Analyzing ${allFunctions.length} functions...`);

    // COST OPTIMIZATION: Batch process 10-15 functions per API call
    const BATCH_SIZE = 12;
    let totalRenamed = 0;

    for (let i = 0; i < allFunctions.length; i += BATCH_SIZE) {
        const batch = allFunctions.slice(i, i + BATCH_SIZE);

        console.log(`[Grok] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFunctions.length / BATCH_SIZE)}...`);

        const renameMap = await analyzeFunctionsWithGrok(
            batch,
            opts.grokInterface,
            opts
        );

        // Apply renames by storing suggested name
        Object.entries(renameMap).forEach(([oldName, info]) => {
            const funcInfo = batch.find(f => f.name === oldName);
            if (funcInfo && funcInfo.func) {
                // Store Grok suggestion in Function instance
                funcInfo.func.grokSuggestedName = info.newName;
                funcInfo.func.grokConfidence = info.confidence;
                funcInfo.func.grokReason = info.reason;

                // CRITICAL: Also store in Variable instance for renameVariables!
                if (funcInfo.variable) {
                    funcInfo.variable.grokSuggestedName = info.newName;
                    funcInfo.variable.grokConfidence = info.confidence;
                }

                console.log(`  [Grok] ${oldName}() → ${info.newName}() (${info.confidence})`);
                totalRenamed++;
            }
        });

        // Rate limiting (1 second between batches)
        if (i + BATCH_SIZE < allFunctions.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log(`[Grok] Renamed ${totalRenamed} functions`);

    return totalRenamed > 0;
}

module.exports = renameFunctionsWithGrok;
