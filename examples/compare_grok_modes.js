/**
 * Compare Grok Analysis Modes
 *
 * Compares cost and performance between:
 * - Standard mode (full code context)
 * - Optimized mode (smart chunking + priority)
 */

const fs = require('fs');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;

// Import both versions
const { grokSemanticAnalysis, printStats: printStatsStandard, stats: statsStandard } =
    require('../lib/mutators/grok_semantic_analysis');

const { grokSemanticAnalysisOptimized, printStats: printStatsOptimized, stats: statsOptimized, CONFIG } =
    require('../lib/mutators/grok_semantic_analysis_optimized');

// Large obfuscated code example
const largeObfuscatedCode = `
// Large obfuscated file with many identifiers
var _0x4f2a = ['Hello', 'World', 'Test', 'Data', 'String'];
var _0x1234 = ['Alpha', 'Beta', 'Gamma', 'Delta'];
var _0x5678 = ['One', 'Two', 'Three'];

function _0xabc(_0x1, _0x2) {
    return _0x1 + ' ' + _0x2;
}

function _0xdef(_0xa, _0xb, _0xc) {
    return _0xa + _0xb + _0xc;
}

function _0x999(_0xx) {
    return _0xx.toUpperCase();
}

// Usage patterns
var a1 = _0x4f2a[0];
var a2 = _0x4f2a[1];
var b1 = _0x1234[0];
var b2 = _0x1234[1];

function _0xmain() {
    var _0xres1 = _0xabc(a1, a2);
    var _0xres2 = _0xdef(a1, a2, b1);
    var _0xres3 = _0x999(_0xres1);
    return _0xres3;
}

// More obfuscated functions
function _0xutil1(_0xp1) {
    return _0xp1.length;
}

function _0xutil2(_0xp2) {
    return _0xp2.toLowerCase();
}

function _0xutil3(_0xp3) {
    return _0xp3.trim();
}

// Rarely used (should be skipped in optimized mode)
var x = 1;
var y = 2;

// Complex nested structure
function _0xouter() {
    function _0xinner(_0xi) {
        return _0xi * 2;
    }

    var _0xval = 10;
    return _0xinner(_0xval);
}

// Array operations
var _0xarr = [1, 2, 3, 4, 5];
function _0xmap(_0xfn, _0xdata) {
    return _0xdata.map(_0xfn);
}

// String operations
var _0xstr1 = "test";
var _0xstr2 = "demo";
function _0xconcat(_0xs1, _0xs2) {
    return _0xs1 + _0xs2;
}

// Export
module.exports = {
    _0xmain,
    _0xabc,
    _0xdef,
    _0xutil1,
    _0xutil2,
    _0xutil3
};
`;

async function compareMode(code, mode) {
    console.log('\n' + '='.repeat(70));
    console.log(`Running ${mode} Mode`);
    console.log('='.repeat(70));

    // Parse
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: []
    });

    const startTime = Date.now();
    let changed = false;

    if (mode === 'STANDARD') {
        changed = await grokSemanticAnalysis(ast, {
            config: { verbose: false }
        });
    } else {
        changed = await grokSemanticAnalysisOptimized(ast, {
            config: { verbose: false }
        });
    }

    const elapsed = Date.now() - startTime;

    console.log(`\nTotal time: ${elapsed}ms`);

    if (changed) {
        const deobfuscated = generate(ast, { compact: false }).code;
        fs.writeFileSync(`/tmp/deobfuscated_${mode.toLowerCase()}.js`, deobfuscated);
        console.log(`✓ Saved to /tmp/deobfuscated_${mode.toLowerCase()}.js`);
    }

    return { elapsed, changed };
}

async function runComparison() {
    console.log('\n' + '█'.repeat(70));
    console.log('GROK ANALYSIS MODE COMPARISON');
    console.log('█'.repeat(70));

    if (!process.env.XAI_API_KEY) {
        console.error('\nError: XAI_API_KEY not set');
        process.exit(1);
    }

    const codeToAnalyze = process.argv[2]
        ? fs.readFileSync(process.argv[2], 'utf8')
        : largeObfuscatedCode;

    console.log(`\nCode size: ${codeToAnalyze.length} chars (~${Math.ceil(codeToAnalyze.length / 4)} tokens)`);

    // Run optimized mode (cheaper, should run this first)
    console.log('\n🚀 Running OPTIMIZED mode first (recommended for large files)...');
    const optimizedResult = await compareMode(codeToAnalyze, 'OPTIMIZED');
    printStatsOptimized();

    // Optional: Run standard mode for comparison (will cost more)
    console.log('\n\n⚠️  Standard mode will cost MORE. Continue? (Ctrl+C to cancel, Enter to continue)');

    // For automated testing, skip standard mode
    if (process.argv.includes('--skip-standard')) {
        console.log('\n→ Skipping standard mode (use --compare to run both)');
    } else if (process.argv.includes('--compare')) {
        await new Promise(resolve => {
            process.stdin.once('data', () => resolve());
        });

        const standardResult = await compareMode(codeToAnalyze, 'STANDARD');
        printStatsStandard();

        // Final comparison
        console.log('\n' + '█'.repeat(70));
        console.log('FINAL COMPARISON');
        console.log('█'.repeat(70));

        console.log('\nOPTIMIZED MODE:');
        console.log(`  API Calls:     ${statsOptimized.totalCalls}`);
        console.log(`  Total Tokens:  ${statsOptimized.totalTokens.toLocaleString()}`);
        console.log(`  Total Cost:    $${statsOptimized.totalCost.toFixed(6)}`);
        console.log(`  Renamed:       ${statsOptimized.identifiersRenamed}`);
        console.log(`  Time:          ${optimizedResult.elapsed}ms`);

        console.log('\nSTANDARD MODE:');
        console.log(`  API Calls:     ${statsStandard.totalCalls}`);
        console.log(`  Total Tokens:  ${statsStandard.totalTokens.toLocaleString()}`);
        console.log(`  Total Cost:    $${statsStandard.totalCost.toFixed(6)}`);
        console.log(`  Renamed:       ${statsStandard.identifiersRenamed}`);
        console.log(`  Time:          ${standardResult.elapsed}ms`);

        console.log('\nSAVINGS:');
        const tokenSavings = statsStandard.totalTokens - statsOptimized.totalTokens;
        const costSavings = statsStandard.totalCost - statsOptimized.totalCost;
        const timeSavings = standardResult.elapsed - optimizedResult.elapsed;

        console.log(`  Tokens saved:  ${tokenSavings.toLocaleString()} (${((tokenSavings / statsStandard.totalTokens) * 100).toFixed(1)}%)`);
        console.log(`  Cost saved:    $${costSavings.toFixed(6)} (${((costSavings / statsStandard.totalCost) * 100).toFixed(1)}%)`);
        console.log(`  Time saved:    ${timeSavings}ms (${((timeSavings / standardResult.elapsed) * 100).toFixed(1)}%)`);
    }

    console.log('\n' + '█'.repeat(70));
    console.log('RECOMMENDATIONS FOR LARGE FILES');
    console.log('█'.repeat(70));
    console.log(`
1. Use OPTIMIZED mode (grokSemanticAnalysisOptimized)
2. Adjust CONFIG.MIN_USAGE_COUNT to skip rare identifiers (current: ${CONFIG.MIN_USAGE_COUNT})
3. Adjust CONFIG.MAX_IDENTIFIERS_PER_BATCH for cost vs quality tradeoff (current: ${CONFIG.MAX_IDENTIFIERS_PER_BATCH})
4. Use caching - identical code patterns won't be reanalyzed

Example for very large files (>100K lines):
  CONFIG.MIN_USAGE_COUNT = 5          // Only analyze frequently used
  CONFIG.MAX_IDENTIFIERS_PER_BATCH = 30  // Smaller batches
  CONFIG.MIN_CONFIDENCE = 0.8         // Only high-confidence renames
`);
}

if (require.main === module) {
    runComparison().catch(error => {
        console.error('\nComparison failed:', error);
        process.exit(1);
    });
}

module.exports = { runComparison };
