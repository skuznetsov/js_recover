/**
 * Grok Semantic Analysis Mutator
 *
 * Uses Grok-4 Fast Reasoning to analyze obfuscated code and suggest better names.
 * Optimized for batch processing - analyzes entire codebase in one call.
 *
 * Strategy:
 * 1. Collect all obfuscated identifiers (variables, functions)
 * 2. Generate full code context
 * 3. Send ONE request to Grok with all context (2M window!)
 * 4. Use function calling to get batch rename suggestions
 * 5. Apply all renames at once
 */

const t = require('@babel/types');
const generate = require('@babel/generator').default;
const crypto = require('crypto');
const { GrokInterface, createUniversalWrapper } = require('../grok');

// Global cache for Grok responses (persists across iterations)
const grokCache = new Map();
let grokInterface = null;
let universalWrapper = null;

// Statistics
const stats = {
    totalCalls: 0,
    cacheHits: 0,
    totalCost: 0,
    totalTokens: 0,
    identifiersAnalyzed: 0,
    identifiersRenamed: 0
};

/**
 * Initialize Grok interface (lazy initialization)
 */
function initGrok() {
    if (!grokInterface) {
        try {
            grokInterface = new GrokInterface({
                model: 'grok-4-fast-reasoning',
                temperature: 0.1,  // Low temp for consistent naming
                maxTokens: 8192,
                useJsonMode: false
            });
            universalWrapper = createUniversalWrapper(grokInterface);
            console.log('✓ Grok semantic analysis initialized');
        } catch (error) {
            console.error('Failed to initialize Grok:', error.message);
            return false;
        }
    }
    return true;
}

/**
 * Check if identifier looks obfuscated
 */
function isObfuscated(name) {
    if (!name || name.length < 2) return false;

    // Patterns of obfuscation:
    return (
        // Hex naming: _0x1a2b3c
        /^_0x[0-9a-f]+$/i.test(name) ||
        // Single letter with numbers: a1, b2, x3
        /^[a-z]\d+$/i.test(name) ||
        // Very short non-descriptive: a, b, x, _ (but not common like i, j, k for loops)
        (/^[a-z_]$/.test(name) && !['i', 'j', 'k', 'x', 'y', 'z'].includes(name)) ||
        // Random-looking: aXbY, qwer
        (/^[a-z]{4}$/i.test(name) && !/^(this|self|that|item|data|info|user|file|path)$/i.test(name))
    );
}

/**
 * Collect all obfuscated identifiers from AST
 */
function collectObfuscatedIdentifiers(ast) {
    const identifiers = new Map(); // name -> { type, nodes: [], usageContext: [] }

    const traverse = require('../traverser').traverseTopDown;

    traverse(ast, (node) => {
        // Variable declarations
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) {
            const name = node.id.name;
            if (isObfuscated(name)) {
                if (!identifiers.has(name)) {
                    identifiers.set(name, { type: 'variable', nodes: [], usageContext: [] });
                }
                identifiers.get(name).nodes.push(node.id);

                // Capture initialization context
                if (node.init) {
                    identifiers.get(name).usageContext.push({
                        type: 'init',
                        code: generate(node.init).code
                    });
                }
            }
        }

        // Function declarations
        if (t.isFunctionDeclaration(node) && t.isIdentifier(node.id)) {
            const name = node.id.name;
            if (isObfuscated(name)) {
                if (!identifiers.has(name)) {
                    identifiers.set(name, { type: 'function', nodes: [], usageContext: [] });
                }
                identifiers.get(name).nodes.push(node.id);

                // Capture function body context
                identifiers.get(name).usageContext.push({
                    type: 'function_body',
                    params: node.params.map(p => generate(p).code),
                    code: generate(node.body).code.substring(0, 200) // First 200 chars
                });
            }
        }

        // Function expressions
        if (t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
            // Track in parent context
            if (node.id && t.isIdentifier(node.id)) {
                const name = node.id.name;
                if (isObfuscated(name)) {
                    if (!identifiers.has(name)) {
                        identifiers.set(name, { type: 'function', nodes: [], usageContext: [] });
                    }
                    identifiers.get(name).nodes.push(node.id);
                }
            }
        }

        return false;
    }, {});

    return identifiers;
}

/**
 * Generate code context for Grok analysis
 */
function generateCodeContext(ast, identifiers) {
    // Generate full code
    const fullCode = generate(ast, {
        compact: false,
        comments: true
    }).code;

    // Build identifier summary
    const identifierSummary = Array.from(identifiers.entries()).map(([name, info]) => {
        const contexts = info.usageContext.slice(0, 3).map(ctx => {
            if (ctx.type === 'init') {
                return `Initialized as: ${ctx.code}`;
            } else if (ctx.type === 'function_body') {
                return `Function(${ctx.params.join(', ')}) { ${ctx.code.substring(0, 100)}... }`;
            }
            return '';
        }).filter(Boolean);

        return `- ${name} (${info.type}): ${contexts.join('; ')}`;
    }).join('\n');

    return {
        fullCode,
        identifierSummary,
        identifierCount: identifiers.size
    };
}

/**
 * Create function declaration for batch renaming
 */
function createRenameFunctionDeclaration() {
    return {
        name: 'suggest_identifier_rename',
        description: 'Suggest a descriptive name for an obfuscated identifier based on its usage in the code',
        parameters: {
            type: 'object',
            properties: {
                original_name: {
                    type: 'string',
                    description: 'The obfuscated identifier name (e.g., _0x1a2b, a1, x)'
                },
                suggested_name: {
                    type: 'string',
                    description: 'A descriptive camelCase name that reflects the identifier\'s purpose'
                },
                identifier_type: {
                    type: 'string',
                    enum: ['variable', 'function', 'parameter', 'property'],
                    description: 'Type of identifier'
                },
                confidence: {
                    type: 'number',
                    minimum: 0,
                    maximum: 1,
                    description: 'Confidence in suggestion (0-1). Use >0.7 for clear cases, <0.5 for uncertain'
                },
                reasoning: {
                    type: 'string',
                    description: 'Brief explanation of why this name was chosen (1 sentence)'
                }
            },
            required: ['original_name', 'suggested_name', 'identifier_type', 'confidence']
        }
    };
}

/**
 * Call Grok with batch analysis request
 */
async function batchAnalyzeWithGrok(codeContext, identifiers) {
    const identifierList = Array.from(identifiers.keys()).join(', ');

    const prompt = `You are an expert at analyzing obfuscated JavaScript code and suggesting meaningful variable names.

Analyze the following code and suggest better names for these obfuscated identifiers:
${identifierList}

Full code:
\`\`\`javascript
${codeContext.fullCode}
\`\`\`

Context summary:
${codeContext.identifierSummary}

For EACH obfuscated identifier, call the suggest_identifier_rename function with your suggestion.
Use descriptive camelCase names. Consider the identifier's usage, initialization, and context.
Only suggest renames with confidence >= 0.7. If unsure about an identifier, use confidence < 0.5.`;

    const messages = [
        { role: 'system', content: 'You are an expert JavaScript code analyst specializing in deobfuscation.' },
        { role: 'user', content: prompt }
    ];

    // Generate cache key
    const cacheKey = crypto.createHash('sha256')
        .update(JSON.stringify({ code: codeContext.fullCode, identifiers: identifierList }))
        .digest('hex');

    // Check cache
    if (grokCache.has(cacheKey)) {
        stats.cacheHits++;
        console.log(`  ✓ Cache hit for ${identifiers.size} identifiers`);
        return grokCache.get(cacheKey);
    }

    // Call Grok
    console.log(`  → Analyzing ${identifiers.size} identifiers with Grok-4...`);
    const startTime = Date.now();

    try {
        const result = await universalWrapper.callWithFunctions(
            messages,
            [createRenameFunctionDeclaration()],
            'auto'  // Let Grok decide when to call functions
        );

        const elapsed = Date.now() - startTime;
        const usage = universalWrapper.getUsageStats();

        stats.totalCalls++;
        stats.totalCost += usage.total_cost || 0;
        stats.totalTokens += usage.total_tokens || 0;

        console.log(`  ✓ Grok analysis complete in ${elapsed}ms`);
        console.log(`    Tokens: ${usage.total_tokens || 0} | Cost: $${(usage.total_cost || 0).toFixed(6)}`);
        console.log(`    Function calls: ${result.functionCalls.length}`);

        // Cache result
        grokCache.set(cacheKey, result);

        return result;

    } catch (error) {
        console.error(`  ✗ Grok API error:`, error.message);
        return null;
    }
}

/**
 * Apply rename suggestions to AST
 */
function applyRenameSuggestions(identifiers, suggestions, minConfidence = 0.7) {
    let renamed = 0;

    for (const suggestion of suggestions) {
        const args = suggestion.function.arguments;

        // Validate suggestion
        if (!args.original_name || !args.suggested_name) {
            continue;
        }

        // Check confidence threshold
        if ((args.confidence || 0) < minConfidence) {
            console.log(`  ⊘ Skipping ${args.original_name} -> ${args.suggested_name} (confidence: ${args.confidence})`);
            continue;
        }

        // Validate suggested name (basic sanity check)
        if (!isValidIdentifierName(args.suggested_name)) {
            console.log(`  ⊘ Invalid name suggestion: ${args.suggested_name}`);
            continue;
        }

        // Get identifier info
        const info = identifiers.get(args.original_name);
        if (!info) {
            continue;
        }

        // Apply rename to all nodes
        for (const node of info.nodes) {
            node.name = args.suggested_name;
            renamed++;
        }

        console.log(`  ✓ ${args.original_name} -> ${args.suggested_name} (${args.confidence.toFixed(2)} confidence)`);
        if (args.reasoning) {
            console.log(`    Reason: ${args.reasoning}`);
        }
    }

    return renamed;
}

/**
 * Validate identifier name
 */
function isValidIdentifierName(name) {
    // Must be valid JavaScript identifier
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) &&
           // Not a reserved word
           !['if', 'else', 'while', 'for', 'function', 'var', 'let', 'const', 'return'].includes(name) &&
           // Reasonable length
           name.length >= 2 && name.length <= 50;
}

/**
 * Print statistics
 */
function printStats() {
    console.log('\n' + '='.repeat(60));
    console.log('Grok Semantic Analysis Statistics');
    console.log('='.repeat(60));
    console.log(`API Calls:           ${stats.totalCalls}`);
    console.log(`Cache Hits:          ${stats.cacheHits}`);
    console.log(`Total Tokens:        ${stats.totalTokens.toLocaleString()}`);
    console.log(`Total Cost:          $${stats.totalCost.toFixed(6)}`);
    console.log(`Identifiers Analyzed: ${stats.identifiersAnalyzed}`);
    console.log(`Identifiers Renamed:  ${stats.identifiersRenamed}`);
    if (stats.identifiersAnalyzed > 0) {
        console.log(`Rename Rate:         ${((stats.identifiersRenamed / stats.identifiersAnalyzed) * 100).toFixed(1)}%`);
    }
    if (stats.totalCalls > 0) {
        console.log(`Avg Cost/Call:       $${(stats.totalCost / stats.totalCalls).toFixed(6)}`);
    }
    console.log('='.repeat(60));
}

/**
 * Main mutator function - called once for the entire AST
 */
async function grokSemanticAnalysis(ast, opts) {
    // Skip if no API key
    if (!process.env.XAI_API_KEY) {
        console.log('⊘ Grok semantic analysis skipped (no XAI_API_KEY)');
        return false;
    }

    // Initialize Grok
    if (!initGrok()) {
        return false;
    }

    console.log('\n' + '='.repeat(60));
    console.log('Grok Semantic Analysis - Batch Mode');
    console.log('='.repeat(60));

    // Step 1: Collect obfuscated identifiers
    console.log('Step 1: Collecting obfuscated identifiers...');
    const identifiers = collectObfuscatedIdentifiers(ast);

    if (identifiers.size === 0) {
        console.log('  ✓ No obfuscated identifiers found');
        return false;
    }

    console.log(`  ✓ Found ${identifiers.size} obfuscated identifiers`);
    stats.identifiersAnalyzed += identifiers.size;

    // Step 2: Generate code context
    console.log('\nStep 2: Generating code context...');
    const codeContext = generateCodeContext(ast, identifiers);
    console.log(`  ✓ Code size: ${codeContext.fullCode.length} chars`);

    // Step 3: Batch analysis with Grok
    console.log('\nStep 3: Analyzing with Grok-4...');
    const result = await batchAnalyzeWithGrok(codeContext, identifiers);

    if (!result || !result.functionCalls || result.functionCalls.length === 0) {
        console.log('  ✗ No suggestions received from Grok');
        return false;
    }

    // Step 4: Apply rename suggestions
    console.log(`\nStep 4: Applying ${result.functionCalls.length} rename suggestions...`);
    const renamed = applyRenameSuggestions(identifiers, result.functionCalls, 0.7);

    stats.identifiersRenamed += renamed;

    console.log(`\n✓ Renamed ${renamed} identifiers`);

    return renamed > 0;
}

/**
 * Wrapper for single-pass mode (must be called on root node)
 */
function grokSemanticAnalysisSinglePass(node, opts, parentStack) {
    // Only run on Program node (root)
    if (node.type !== 'Program') {
        return false;
    }

    // This is async, so we need to handle it differently
    // For now, just mark for manual execution
    console.log('\n⚠️  Grok semantic analysis must be run manually:');
    console.log('   await grokSemanticAnalysis(ast, opts);');

    return false;
}

// Export both sync (marker) and async (actual) versions
module.exports = grokSemanticAnalysisSinglePass;
module.exports.grokSemanticAnalysis = grokSemanticAnalysis;
module.exports.printStats = printStats;
module.exports.stats = stats;
