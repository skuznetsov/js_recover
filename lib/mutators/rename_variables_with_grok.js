const t = require('@babel/types');
const Utils = require('../utils');

/**
 * Grok-based Variable Renaming
 *
 * Analyzes variable usage context and uses Grok AI to suggest meaningful names.
 * This transforms obfuscated code like:
 *   var e = require(1); var n = e.decode(t);
 * Into readable code:
 *   var decoder = require(1); var decodedData = decoder.decode(encodedText);
 *
 * Only runs if:
 * - opts.grokInterface is provided
 * - config.useGrokForVariables !== false
 */

/**
 * Extract usage context for a variable
 */
function extractVariableContext(variable, scope, ast) {
    const contexts = [];

    // Get variable name
    const varName = variable.name;

    // Collect declarations
    if (variable.definers && variable.definers.length > 0) {
        variable.definers.forEach(definer => {
            if (definer.type === 'VariableDeclarator' && definer.init) {
                const code = generateCode(definer);
                contexts.push({ type: 'declaration', code });
            } else if (definer.type === 'AssignmentExpression') {
                const code = generateCode(definer);
                contexts.push({ type: 'assignment', code });
            }
        });
    }

    // Collect usages from history
    if (variable.history && variable.history.length > 0) {
        variable.history.slice(0, 5).forEach(entry => {
            if (entry.node && entry.operation) {
                const code = generateCode(entry.node);
                contexts.push({
                    type: entry.operation,
                    code: code.substring(0, 100) // Limit length
                });
            }
        });
    }

    return contexts;
}

/**
 * Generate code snippet from AST node
 */
function generateCode(node) {
    try {
        const generate = require('@babel/generator').default;
        const result = generate(node, { concise: true });
        return result.code.substring(0, 200);
    } catch (e) {
        // Fallback for nodes that can't be generated
        return '';
    }
}

/**
 * Analyze variables in a scope using Grok
 */
async function analyzeVariablesWithGrok(variables, grok, opts) {
    if (variables.length === 0) return {};

    // Prepare variable summaries
    const varSummaries = variables.map(v => {
        const contexts = v.contexts || [];
        const contextStr = contexts.map(c => c.code).join('; ');

        return {
            name: v.name,
            context: contextStr.substring(0, 500), // Limit context
            usageCount: v.usageCount || 0,
            type: v.type || 'unknown'
        };
    });

    const prompt = `You are analyzing obfuscated JavaScript code. Suggest meaningful variable names based on their usage context.

Variables to analyze:
${JSON.stringify(varSummaries, null, 2)}

For each variable, suggest:
1. A descriptive name (camelCase, max 30 chars)
2. Confidence level (high/medium/low)
3. Brief reason

Rules:
- Keep original name if it's already good (e.g., "index", "data", "config")
- Use descriptive names (e.g., "userAuth" not just "auth")
- If unclear, use generic names (e.g., "value1", "temp")
- Only rename if confidence is medium or high

Respond in JSON:
{
  "renames": [
    {"old": "e", "new": "decoder", "confidence": "high", "reason": "used for base64 decoding"},
    {"old": "n", "new": "n", "confidence": "low", "reason": "unclear usage"}
  ]
}`;

    try {
        const content = await grok.generate([
            { role: 'user', content: prompt }
        ]);

        const analysis = JSON.parse(content);

        if (!analysis.renames || !Array.isArray(analysis.renames)) {
            console.error('[Grok] Invalid response format');
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
        console.error('[Grok] Variable analysis failed:', error.message);
        return {};
    }
}

/**
 * Main mutator function
 * Runs after scope analysis to rename variables using Grok
 */
async function renameVariablesWithGrok(node, opts, parentStack) {
    // Check if Grok is available
    if (!opts.grokInterface) {
        return false; // Grok not configured
    }

    if (opts.config && opts.config.useGrokForVariables === false) {
        return false; // Feature disabled
    }

    // Only process Program or File node (run once)
    if (node.type !== 'Program' && node.type !== 'File') {
        return false;
    }

    // Check if we already processed this
    if (opts._grokVariablesProcessed) {
        return false;
    }
    opts._grokVariablesProcessed = true;

    console.log('[Grok] Starting variable analysis...');

    const scopes = opts.astScopes || {};
    const allVariables = [];

    // Collect all variables from all scopes
    Object.values(scopes).forEach(scope => {
        if (scope.variables) {
            Object.values(scope.variables).forEach(variable => {
                // Skip functions (already renamed)
                if (variable.value && variable.value.constructor &&
                    variable.value.constructor.name === 'Function') {
                    return;
                }

                // Skip variables with good names already
                if (isGoodName(variable.name)) {
                    return;
                }

                // Extract context
                const contexts = extractVariableContext(variable, scope, node);

                allVariables.push({
                    name: variable.name,
                    variable: variable,
                    scope: scope,
                    contexts: contexts,
                    usageCount: variable.usageCount || 0
                });
            });
        }
    });

    if (allVariables.length === 0) {
        console.log('[Grok] No variables to analyze');
        return false;
    }

    console.log(`[Grok] Analyzing ${allVariables.length} variables...`);

    // Process in batches to avoid token limits
    const BATCH_SIZE = 20;
    let totalRenamed = 0;

    for (let i = 0; i < allVariables.length; i += BATCH_SIZE) {
        const batch = allVariables.slice(i, i + BATCH_SIZE);

        console.log(`[Grok] Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allVariables.length / BATCH_SIZE)}...`);

        const renameMap = await analyzeVariablesWithGrok(
            batch,
            opts.grokInterface,
            opts
        );

        // Apply renames
        Object.entries(renameMap).forEach(([oldName, info]) => {
            const varInfo = batch.find(v => v.name === oldName);
            if (varInfo && varInfo.variable) {
                // Apply rename by updating variable name
                // This will be picked up by renameVariables mutator
                varInfo.variable.grokSuggestedName = info.newName;
                varInfo.variable.grokConfidence = info.confidence;
                varInfo.variable.grokReason = info.reason;

                console.log(`  [Grok] ${oldName} → ${info.newName} (${info.confidence})`);
                totalRenamed++;
            }
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Grok] Renamed ${totalRenamed} variables`);

    // Signal that variables were renamed (for subsequent renameVariables mutator)
    return totalRenamed > 0;
}

/**
 * Check if a variable name is already good
 */
function isGoodName(name) {
    // Single letter names are bad
    if (name.length <= 2) return false;

    // Common good names
    const goodNames = [
        'index', 'data', 'config', 'options', 'params', 'result',
        'error', 'callback', 'resolve', 'reject', 'response',
        'request', 'value', 'key', 'item', 'element', 'node'
    ];

    if (goodNames.includes(name.toLowerCase())) {
        return true;
    }

    // Descriptive names (3+ words, camelCase)
    if (name.length > 10 && /[a-z][A-Z]/.test(name)) {
        return true;
    }

    return false;
}

module.exports = renameVariablesWithGrok;
