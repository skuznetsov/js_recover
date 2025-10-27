/**
 * Test Grok Semantic Analysis
 *
 * Demonstrates batch semantic analysis with Grok-4
 */

const fs = require('fs');
const parser = require('@babel/parser');
const generate = require('@babel/generator').default;
const { grokSemanticAnalysis, printStats } = require('../lib/mutators/grok_semantic_analysis');

// Example obfuscated code
const obfuscatedCode = `
// Obfuscated greeting function
var _0x4f2a = ['Hello', 'World', 'from', 'Grok'];

function _0x1b3c(_0x1, _0x2) {
    return _0x1 + ' ' + _0x2;
}

function _0xabc() {
    var a1 = _0x4f2a[0];
    var a2 = _0x4f2a[1];
    return _0x1b3c(a1, a2);
}

// Obfuscated math operations
var x = 10;
var y = 20;

function a(_0xa, _0xb) {
    return _0xa + _0xb;
}

function b(_0xc, _0xd) {
    return _0xc * _0xd;
}

var _0xresult = b(a(x, y), 2);

// Obfuscated string utilities
function _0xstr(_0xs) {
    return _0xs.toUpperCase();
}

function _0xlen(_0xl) {
    return _0xl.length;
}

var _0xmsg = "test";
var _0xout = _0xstr(_0xmsg);
`;

async function testSemanticAnalysis() {
    console.log('='.repeat(60));
    console.log('Grok Semantic Analysis Test');
    console.log('='.repeat(60));

    if (!process.env.XAI_API_KEY) {
        console.error('\nError: XAI_API_KEY environment variable not set');
        console.error('Please set it with: export XAI_API_KEY=your_api_key');
        process.exit(1);
    }

    // Parse code
    console.log('\nParsing obfuscated code...');
    const ast = parser.parse(obfuscatedCode, {
        sourceType: 'module',
        plugins: []
    });

    console.log('Original code:');
    console.log('-'.repeat(60));
    console.log(obfuscatedCode);
    console.log('-'.repeat(60));

    // Run semantic analysis
    console.log('\nRunning Grok semantic analysis...');
    const changed = await grokSemanticAnalysis(ast, {
        config: { verbose: false }
    });

    if (changed) {
        // Generate deobfuscated code
        const deobfuscated = generate(ast, {
            compact: false,
            comments: true
        }).code;

        console.log('\nDeobfuscated code:');
        console.log('-'.repeat(60));
        console.log(deobfuscated);
        console.log('-'.repeat(60));

        // Save to file
        fs.writeFileSync('/tmp/deobfuscated.js', deobfuscated);
        console.log('\n✓ Saved to /tmp/deobfuscated.js');
    } else {
        console.log('\n⊘ No changes made');
    }

    // Print statistics
    printStats();
}

async function testBatchEfficiency() {
    console.log('\n' + '='.repeat(60));
    console.log('Batch Efficiency Test');
    console.log('='.repeat(60));

    // Load larger obfuscated file
    const testFile = process.argv[2] || 'test/cases/05_nested_complex.js';

    if (!fs.existsSync(testFile)) {
        console.error(`File not found: ${testFile}`);
        console.log('\nUsage: node examples/test_semantic_analysis.js [file.js]');
        return;
    }

    console.log(`\nAnalyzing file: ${testFile}`);
    const code = fs.readFileSync(testFile, 'utf8');
    console.log(`Code size: ${code.length} bytes`);

    // Parse
    const ast = parser.parse(code, {
        sourceType: 'module',
        plugins: []
    });

    // Run analysis
    const startTime = Date.now();
    const changed = await grokSemanticAnalysis(ast, {
        config: { verbose: false }
    });
    const elapsed = Date.now() - startTime;

    console.log(`\nTotal analysis time: ${elapsed}ms`);

    if (changed) {
        const deobfuscated = generate(ast).code;
        const outFile = testFile.replace('.js', '.deobfuscated.js');
        fs.writeFileSync(outFile, deobfuscated);
        console.log(`✓ Saved to ${outFile}`);
    }

    printStats();
}

// Run tests
async function main() {
    try {
        // Test 1: Small example
        await testSemanticAnalysis();

        // Test 2: Efficiency test with file (optional)
        if (process.argv.length > 2) {
            await testBatchEfficiency();
        } else {
            console.log('\n💡 Tip: Run with a file to test batch efficiency:');
            console.log('   node examples/test_semantic_analysis.js test/cases/05_nested_complex.js');
        }

    } catch (error) {
        console.error('\nTest failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { testSemanticAnalysis, testBatchEfficiency };
