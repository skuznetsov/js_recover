/**
 * Grok Semantic Analysis - Cost-Optimized Version
 *
 * Optimizations for very large obfuscated files:
 * 1. Smart chunking - split large files into context chunks
 * 2. Priority-based analysis - analyze most-used identifiers first
 * 3. Incremental batching - group by context locality
 * 4. Smart context extraction - only send relevant code
 * 5. Confidence-based retry - skip low-impact identifiers
 */

const t = require('@babel/types');
const generate = require('@babel/generator').default;
const crypto = require('crypto');
const { GrokInterface, createUniversalWrapper } = require('../grok');
const { tracker: costTracker } = require('../cost_tracker');

// Configuration
const CONFIG = {
    // Maximum tokens per request (~1.5M tokens = ~500K chars)
    MAX_CHARS_PER_CHUNK: 400000,
    // Context window around identifier usage (chars)
    CONTEXT_WINDOW: 500,
    // Minimum confidence to apply rename
    MIN_CONFIDENCE: 0.7,
    // Minimum usage count to analyze (skip rarely used identifiers)
    MIN_USAGE_COUNT: 2,
    // Maximum identifiers per batch
    MAX_IDENTIFIERS_PER_BATCH: 50
};

// Global cache
const grokCache = new Map();
let grokInterface = null;
let universalWrapper = null;

// Enhanced statistics
const stats = {
    totalCalls: 0,
    cacheHits: 0,
    totalCost: 0,
    totalTokens: 0,
    identifiersAnalyzed: 0,
    identifiersRenamed: 0,
    identifiersSkipped: 0,
    chunksProcessed: 0,
    avgConfidence: 0
};

/**
 * Initialize Grok
 */
function initGrok() {
    if (!grokInterface) {
        try {
            grokInterface = new GrokInterface({
                model: 'grok-4-fast-reasoning',
                temperature: 0.1,
                maxTokens: 8192,
                useJsonMode: false
            });
            universalWrapper = createUniversalWrapper(grokInterface);
            console.log('✓ Grok semantic analysis initialized (optimized mode)');
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
    return (
        /^_0x[0-9a-f]+$/i.test(name) ||
        /^[a-z]\d+$/i.test(name) ||
        (/^[a-z_]$/.test(name) && !['i', 'j', 'k', 'x', 'y', 'z'].includes(name)) ||
        (/^[a-z]{2,4}$/i.test(name) && !/^(this|self|that|item|data|info|user|file|path|name|code|text)$/i.test(name))
    );
}

/**
 * Collect identifiers with usage statistics and context
 */
function collectIdentifiersWithContext(ast, fullCode) {
    const identifiers = new Map();
    const codeLines = fullCode.split('\n');

    const traverse = require('../traverser').traverseTopDown;

    traverse(ast, (node) => {
        // Helper to add usage
        const addUsage = (name, nodeRef, usageType, context) => {
            if (!isObfuscated(name)) return;

            if (!identifiers.has(name)) {
                identifiers.set(name, {
                    type: 'unknown',
                    nodes: [],
                    usages: [],
                    usageCount: 0,
                    contexts: []
                });
            }

            const info = identifiers.get(name);
            info.nodes.push(nodeRef);
            info.usageCount++;
            info.usages.push(usageType);

            // Extract context
            if (node.loc) {
                const line = node.loc.start.line - 1;
                const startLine = Math.max(0, line - 3);
                const endLine = Math.min(codeLines.length, line + 3);
                const contextCode = codeLines.slice(startLine, endLine).join('\n');

                info.contexts.push({
                    type: usageType,
                    code: contextCode.substring(0, CONFIG.CONTEXT_WINDOW),
                    line: line + 1
                });
            }
        };

        // Variable declarations
        if (t.isVariableDeclarator(node) && t.isIdentifier(node.id)) {
            const name = node.id.name;
            addUsage(name, node.id, 'declaration', node.init);

            if (!identifiers.has(name)) return;
            identifiers.get(name).type = 'variable';

            if (node.init) {
                identifiers.get(name).initCode = generate(node.init).code.substring(0, 100);
            }
        }

        // Function declarations
        if (t.isFunctionDeclaration(node) && t.isIdentifier(node.id)) {
            const name = node.id.name;
            addUsage(name, node.id, 'function_declaration', node);

            if (!identifiers.has(name)) return;
            identifiers.get(name).type = 'function';
            identifiers.get(name).params = node.params.map(p => generate(p).code);
        }

        // Identifier references (usage)
        if (t.isIdentifier(node)) {
            addUsage(node.name, node, 'reference', null);
        }

        return false;
    }, {});

    return identifiers;
}

/**
 * Prioritize identifiers by importance
 */
function prioritizeIdentifiers(identifiers) {
    const prioritized = Array.from(identifiers.entries())
        .filter(([name, info]) => {
            // Skip rarely used identifiers
            if (info.usageCount < CONFIG.MIN_USAGE_COUNT) {
                stats.identifiersSkipped++;
                return false;
            }
            return true;
        })
        .map(([name, info]) => {
            // Calculate priority score
            let score = 0;

            // Usage frequency
            score += info.usageCount * 10;

            // Type importance (functions > variables)
            if (info.type === 'function') score += 50;
            if (info.type === 'variable') score += 20;

            // Length (shorter = more suspicious = higher priority)
            score += (10 - Math.min(name.length, 10)) * 5;

            return { name, info, score };
        })
        .sort((a, b) => b.score - a.score);

    return prioritized;
}

/**
 * Create smart context for batch
 */
function createSmartContext(batch, fullCode) {
    // Extract unique contexts
    const uniqueContexts = new Set();
    const identifierSummary = [];

    for (const { name, info } of batch) {
        // Add unique code contexts
        for (const ctx of info.contexts.slice(0, 2)) {
            uniqueContexts.add(ctx.code);
        }

        // Build summary
        const usage = info.usageCount > 1 ? `used ${info.usageCount}x` : 'used 1x';
        const init = info.initCode ? `= ${info.initCode}` : '';
        const params = info.params ? `(${info.params.join(', ')})` : '';

        identifierSummary.push(`- ${name} [${info.type}]: ${usage} ${init}${params}`);
    }

    // Combine contexts
    const contextCode = Array.from(uniqueContexts).join('\n\n---\n\n');

    return {
        contextCode: contextCode.substring(0, CONFIG.MAX_CHARS_PER_CHUNK),
        identifierSummary: identifierSummary.join('\n'),
        contextSize: contextCode.length
    };
}

/**
 * Batch analyze chunk
 */
async function analyzeChunk(batch, fullCode) {
    const context = createSmartContext(batch, fullCode);

    const identifierList = batch.map(b => b.name).join(', ');

    const prompt = `Analyze these ${batch.length} obfuscated JavaScript identifiers and suggest meaningful names.

Identifiers to analyze:
${context.identifierSummary}

Relevant code context:
\`\`\`javascript
${context.contextCode}
\`\`\`

For EACH identifier, call suggest_identifier_rename with:
- A descriptive camelCase name based on usage
- Confidence 0.7-1.0 for clear cases, <0.7 if uncertain
- Brief reasoning

Focus on identifiers with clear patterns. Skip if truly ambiguous.`;

    const messages = [
        { role: 'system', content: 'You are a JavaScript deobfuscation expert. Suggest concise, meaningful names.' },
        { role: 'user', content: prompt }
    ];

    // Cache key
    const cacheKey = crypto.createHash('sha256')
        .update(JSON.stringify({ identifiers: identifierList, context: context.contextCode }))
        .digest('hex');

    if (grokCache.has(cacheKey)) {
        stats.cacheHits++;
        console.log(`    ✓ Cache hit`);
        return grokCache.get(cacheKey);
    }

    // Call Grok
    console.log(`    → Grok analyzing ${batch.length} identifiers (${context.contextSize} chars)...`);
    const startTime = Date.now();

    try {
        const result = await universalWrapper.callWithFunctions(
            messages,
            [{
                name: 'suggest_identifier_rename',
                description: 'Suggest descriptive name for obfuscated identifier',
                parameters: {
                    type: 'object',
                    properties: {
                        original_name: { type: 'string', description: 'Obfuscated name' },
                        suggested_name: { type: 'string', description: 'Descriptive camelCase name' },
                        identifier_type: {
                            type: 'string',
                            enum: ['variable', 'function', 'parameter'],
                            description: 'Type of identifier'
                        },
                        confidence: {
                            type: 'number',
                            minimum: 0,
                            maximum: 1,
                            description: 'Confidence (>0.7 recommended)'
                        },
                        reasoning: { type: 'string', description: '1 sentence explanation' }
                    },
                    required: ['original_name', 'suggested_name', 'identifier_type', 'confidence']
                }
            }],
            'auto'
        );

        const elapsed = Date.now() - startTime;
        const usage = universalWrapper.getUsageStats();

        stats.totalCalls++;
        stats.totalCost += usage.total_cost || 0;
        stats.totalTokens += usage.total_tokens || 0;

        // Log to cost tracker
        costTracker.logOperation('Grok Batch Analysis', {
            total_cost: usage.total_cost || 0,
            total_tokens: usage.total_tokens || 0,
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            identifiers_analyzed: batch.length,
            identifiers_renamed: 0 // Will be updated after applyRenames
        });

        console.log(`    ✓ Complete in ${elapsed}ms | ${usage.total_tokens || 0} tokens | $${(usage.total_cost || 0).toFixed(6)}`);

        grokCache.set(cacheKey, result);
        return result;

    } catch (error) {
        console.error(`    ✗ Error:`, error.message);
        return null;
    }
}

/**
 * Apply renames with validation
 */
function applyRenames(identifiersMap, suggestions) {
    let renamed = 0;
    const confidences = [];

    for (const suggestion of suggestions) {
        const args = suggestion.function.arguments;

        if (!args.original_name || !args.suggested_name) continue;

        const conf = args.confidence || 0;
        confidences.push(conf);

        if (conf < CONFIG.MIN_CONFIDENCE) {
            console.log(`      ⊘ Skip ${args.original_name} (confidence: ${conf.toFixed(2)})`);
            continue;
        }

        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(args.suggested_name)) {
            console.log(`      ⊘ Invalid name: ${args.suggested_name}`);
            continue;
        }

        const info = identifiersMap.get(args.original_name);
        if (!info) continue;

        for (const node of info.nodes) {
            node.name = args.suggested_name;
        }

        renamed += info.nodes.length;
        console.log(`      ✓ ${args.original_name} -> ${args.suggested_name} (${conf.toFixed(2)}) - ${info.usageCount} refs`);
    }

    if (confidences.length > 0) {
        const avgConf = confidences.reduce((a, b) => a + b, 0) / confidences.length;
        stats.avgConfidence = (stats.avgConfidence * stats.chunksProcessed + avgConf) / (stats.chunksProcessed + 1);
    }

    return renamed;
}

/**
 * Main optimized semantic analysis
 */
async function grokSemanticAnalysisOptimized(ast, opts) {
    if (!process.env.XAI_API_KEY) {
        console.log('⊘ Grok skipped (no XAI_API_KEY)');
        return false;
    }

    if (!initGrok()) return false;

    // Start cost tracking
    const filename = opts.filename || 'unknown.js';
    costTracker.startSession(filename);

    console.log('\n' + '='.repeat(60));
    console.log('Grok Semantic Analysis - Cost-Optimized Mode');
    console.log('='.repeat(60));

    // Step 1: Generate full code
    console.log('Step 1: Generating full code...');
    const fullCode = generate(ast, { compact: false }).code;
    console.log(`  ✓ Code size: ${fullCode.length} chars (~${Math.ceil(fullCode.length / 4)} tokens)`);

    // Step 2: Collect identifiers with context
    console.log('\nStep 2: Collecting identifiers with usage context...');
    const identifiers = collectIdentifiersWithContext(ast, fullCode);
    console.log(`  ✓ Found ${identifiers.size} obfuscated identifiers`);

    if (identifiers.size === 0) {
        console.log('  ✓ No obfuscated identifiers');
        return false;
    }

    // Step 3: Prioritize
    console.log('\nStep 3: Prioritizing by importance...');
    const prioritized = prioritizeIdentifiers(identifiers);
    console.log(`  ✓ ${prioritized.length} identifiers pass threshold (skipped ${stats.identifiersSkipped})`);

    if (prioritized.length === 0) {
        console.log('  ⊘ No identifiers worth analyzing');
        return false;
    }

    // Step 4: Batch processing
    console.log('\nStep 4: Batch processing...');
    const batches = [];
    for (let i = 0; i < prioritized.length; i += CONFIG.MAX_IDENTIFIERS_PER_BATCH) {
        batches.push(prioritized.slice(i, i + CONFIG.MAX_IDENTIFIERS_PER_BATCH));
    }

    console.log(`  ✓ Split into ${batches.length} batches`);

    let totalRenamed = 0;

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        console.log(`\n  Batch ${i + 1}/${batches.length} (${batch.length} identifiers):`);

        const result = await analyzeChunk(batch, fullCode);

        if (result && result.functionCalls.length > 0) {
            console.log(`    ✓ Received ${result.functionCalls.length} suggestions`);

            const renamed = applyRenames(identifiers, result.functionCalls);
            totalRenamed += renamed;
            stats.identifiersAnalyzed += batch.length;
            stats.identifiersRenamed += renamed;
            stats.chunksProcessed++;
        } else {
            console.log(`    ⊘ No suggestions`);
        }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✓ Total renamed: ${totalRenamed} identifier references`);
    console.log(`${'='.repeat(60)}`);

    // End cost tracking and show summary
    costTracker.endSession();

    return totalRenamed > 0;
}

/**
 * Print detailed statistics
 */
function printStats() {
    console.log('\n' + '='.repeat(60));
    console.log('Grok Cost-Optimized Statistics');
    console.log('='.repeat(60));
    console.log(`API Calls:            ${stats.totalCalls}`);
    console.log(`Cache Hits:           ${stats.cacheHits}`);
    console.log(`Chunks Processed:     ${stats.chunksProcessed}`);
    console.log(`Total Tokens:         ${stats.totalTokens.toLocaleString()}`);
    console.log(`Total Cost:           $${stats.totalCost.toFixed(6)}`);
    console.log(`Identifiers Analyzed: ${stats.identifiersAnalyzed}`);
    console.log(`Identifiers Renamed:  ${stats.identifiersRenamed}`);
    console.log(`Identifiers Skipped:  ${stats.identifiersSkipped} (low usage)`);
    console.log(`Avg Confidence:       ${(stats.avgConfidence * 100).toFixed(1)}%`);

    if (stats.identifiersAnalyzed > 0) {
        const renameRate = (stats.identifiersRenamed / stats.identifiersAnalyzed) * 100;
        console.log(`Rename Rate:          ${renameRate.toFixed(1)}%`);
    }

    if (stats.totalCalls > 0) {
        console.log(`Avg Cost/Call:        $${(stats.totalCost / stats.totalCalls).toFixed(6)}`);
    }

    if (stats.identifiersRenamed > 0) {
        console.log(`Cost/Renamed ID:      $${(stats.totalCost / stats.identifiersRenamed).toFixed(6)}`);
    }

    console.log('='.repeat(60));
}

module.exports = grokSemanticAnalysisOptimized;
module.exports.grokSemanticAnalysisOptimized = grokSemanticAnalysisOptimized;
module.exports.printStats = printStats;
module.exports.stats = stats;
module.exports.CONFIG = CONFIG;
