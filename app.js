#!/usr/bin/env node --max-old-space-size=16386

"use strict";

if (!process.env.NODE_CONFIG_DIR) {
    process.env.NODE_CONFIG_DIR = __dirname + "/config";
}

const config = require('config');
const fs = require('fs');
// const parser = require('babylon');
const parser = require('@babel/parser');
const _ = require('lodash');
const request = require('request');
const readline = require('readline');
const SourceMapConsumer = require('source-map').SourceMapConsumer;
const CodeGenerator = require('@babel/generator').CodeGenerator;
// const astring = require('astring');
// const generate = require('@babel/generator').default;
const {traverseTopDown, traverseBottomUp} = require("./lib/traverser");
const {cleanupParentReferences, cleanupContext} = require("./lib/cleanup");

// Node mutators
// const dumpScopes = require("./lib/mutators/dump_scopes");
const assignValuesToVariables = require("./lib/mutators/assign_values_to_variables");
const createScopes = require("./lib/mutators/create_scopes");
const replaceSequentialAssignmentsInFlowControl = require("./lib/mutators/replace_sequential_assignments_in_flow_control");
const replaceSequentialAssignments = require("./lib/mutators/replace_sequential_assignments");
const fixControlFlowStatementsWithOneStatement = require("./lib/mutators/fix_control_flow_statements_with_one_statement");
const removeLocationInformation = require("./lib/mutators/remove_location_information");
const removeEmptyFunctions = require("./lib/mutators/remove_empty_functions");
const defineFunctions = require("./lib/mutators/define_functions");
const countFunctionInvocations = require("./lib/mutators/count_function_invocations");
const recoverBooleans = require("./lib/mutators/recover_booleans");
const renameVariables = require("./lib/mutators/rename_variables");
const renameVariablesWithGrok = require("./lib/mutators/rename_variables_with_grok");
const renameFunctionsWithGrok = require("./lib/mutators/rename_functions_with_grok");
const applyFunctionRenames = require("./lib/mutators/apply_function_renames");

// New mutators (2025-10-25)
const foldConstants = require("./lib/mutators/fold_constants");
const deobfuscateStrings = require("./lib/mutators/deobfuscate_strings");
const eliminateDeadCode = require("./lib/mutators/eliminate_dead_code");
const unpackBundles = require("./lib/mutators/unpack_bundles");
const simplifyPropertyAccess = require("./lib/mutators/simplify_property_access");
const inlineStringArrayAccess = require("./lib/mutators/inline_string_array_access");
const extractNestedBundles = require("./lib/mutators/extract_nested_bundles");

const Utils = require("./lib/utils");
const GrokInterface = require("./lib/grok/interface");
const { generateMalwareReport, formatReportConsole, formatReportMarkdown } = require("./lib/malware_report");

if (typeof (config.verbose) === "undefined") {
    console.error(`ERROR: Cannot find config file at ${process.env.NODE_CONFIG_DIR}`);
    process.exit(1);
}

String.prototype.last = function () {
    return this[this.length - 1];
};

Array.prototype.last = function (n = 0) {
    let value = (n >= 0 && n <= this.length - 1) ? this[this.length - (n + 1)] : null;
    return value;
};

function dumpScopes(scopes, parent, level = 0) {
    let children = Object.values(scopes).filter(el => el.parent == parent);
    for (let scope of children) {
        let varsOrFuncs = Object.values(scope.variables);
        let funcs = varsOrFuncs.filter(el => el.value?.constructor?.name == "Function");
        let vars = varsOrFuncs.filter(el => el.value?.constructor?.name != "Function");

        if (varsOrFuncs.length > 0) {
            if (funcs.length > 0) {
                console.log('Functions:');
                for (let func of funcs) {
                    console.log(`Name: ${func.value.name}, call count: ${func.value.callCount}`);
                }
            }
            if (vars.length > 0) {
                console.log('Variables:');
                for (let variable of vars) {
                    console.log(variable.toString());
                }
            }
        }
        dumpScopes(scopes, scope, level + 1);
    }
    
}



const processingFileName = fs.realpathSync(process.argv[2] || config.defaultFileToProcess);
const code = fs.readFileSync(processingFileName, "utf8");
console.log(`Processing ${processingFileName}...`);

// let mapUrl = (code.match(/^\/\/#\s*sourceMappingURL=(.+)$/gim)||[""])[0].replace(/^\/\/#\s*sourceMappingURL=/, '');

// new Promise((resolve, reject) => {
//     if (config.sourceMaps.use && mapUrl) {
//         try {
//             request.get(mapUrl, function (err, response, body) {
//                 if (err)
//                 {
//                     resolve(null);
//                     return;
//                 }

//                 let smc = new SourceMapConsumer(JSON.parse(body));
//                 if (config.sourceMaps.saveOriginals && smc.sources && smc.sources.length > 0) {
//                     let mainPath = process.argc > 2 ? process.argv[3] : config.sourceMaps.defaultOutputFolder;
//                     mainPath = fs.realpathSync(mainPath);
//                     mainPath += (mainPath.last() == "/" ? "" : "/");
//                     Utils.createAllFoldersInPath(mainPath);
//                     _.each(smc.sources, (src, idx) => {
//                         let fileName = mainPath +
//                             (mainPath.last() == '/'
//                                 || src[0] == '/' ? "" : "/")
//                             + src;
//                         Utils.createAllFoldersInPath(fileName);
//                         fs.writeFileSync(fileName, smc.sourcesContent[idx], { flag: "w" });
//                     });
//                 }
//                 resolve(smc);
//             });
//         } catch (ex) {
//             resolve(null);
//         }    
//     } else {
//         resolve(null);
//     }
// }).then (smc => {
const ast = parser.parse(code, config.parser);

// FIX P2-4: Validate AST size (protection against malware "AST bombs")
function validateAST(ast, fileSize) {
    const MAX_DEPTH = config.maxAstDepth || 500;          // Max nesting depth
    const MIN_BYTES_PER_NODE = 0.5;                       // AST bomb threshold (very minified code ~1, bomb <0.5)

    let nodeCount = 0;
    let maxDepth = 0;

    function traverse(node, depth) {
        if (!node || typeof node !== 'object') return;

        nodeCount++;

        // Check depth (always important)
        if (depth > MAX_DEPTH) {
            throw new Error(`AST too deep: ${depth} levels (max ${MAX_DEPTH}). Possible malware anti-analysis trick!`);
        }
        maxDepth = Math.max(maxDepth, depth);

        // Check for AST bomb: too many nodes for file size
        // Real AST bomb: small file (<100KB) generates millions of nodes
        // Legitimate large file: proportional nodes to code size
        if (nodeCount % 100000 === 0) { // Check every 100K nodes
            const bytesPerNode = fileSize / nodeCount;
            if (bytesPerNode < MIN_BYTES_PER_NODE) {
                throw new Error(`AST bomb detected: ${nodeCount} nodes from ${fileSize} bytes (${bytesPerNode.toFixed(2)} bytes/node). Possible malware!`);
            }
        }

        for (const key in node) {
            if (node.hasOwnProperty(key) && key !== 'parentNode' && key !== 'parentNodeProperty') {
                const value = node[key];
                if (Array.isArray(value)) {
                    value.forEach(child => traverse(child, depth + 1));
                } else if (value && typeof value === 'object') {
                    traverse(value, depth + 1);
                }
            }
        }
    }

    traverse(ast, 0);

    // Final check with actual ratio
    const bytesPerNode = fileSize / nodeCount;
    if (bytesPerNode < MIN_BYTES_PER_NODE) {
        throw new Error(`AST bomb detected: ${nodeCount} nodes from ${fileSize} bytes (${bytesPerNode.toFixed(2)} bytes/node)`);
    }

    return { nodeCount, maxDepth, bytesPerNode };
}

const astStats = validateAST(ast, code.length);
console.log(`✓ AST validated: ${astStats.nodeCount.toLocaleString()} nodes, max depth ${astStats.maxDepth}, ${astStats.bytesPerNode.toFixed(2)} bytes/node`);

// FIX: Estimate Grok cost and ask for confirmation if expensive
function estimateGrokCost(nodeCount) {
    // Empirical ratio: ~3-5% of AST nodes are analyzable entities (variables/functions)
    const estimatedEntities = Math.floor(nodeCount * 0.04);  // Use 4% as middle estimate
    const estimatedVariables = Math.floor(estimatedEntities * 0.8);  // ~80% are variables
    const estimatedFunctions = Math.floor(estimatedEntities * 0.2);  // ~20% are functions

    // Batch sizes from Grok implementation
    const VARS_PER_BATCH = 20;
    const FUNCS_PER_BATCH = 12;

    const varBatches = Math.ceil(estimatedVariables / VARS_PER_BATCH);
    const funcBatches = Math.ceil(estimatedFunctions / FUNCS_PER_BATCH);
    const totalBatches = varBatches + funcBatches;

    // Empirical token usage from test_obfuscated.js:
    // 12 entities → 2,034 tokens (1,632 input, 402 output)
    // ≈ 170 tokens/entity (136 input, 34 output)
    const tokensPerEntity = 170;
    const estimatedTokens = estimatedEntities * tokensPerEntity;

    // Pricing: $0.20/M input, $0.50/M output (grok-4-fast-reasoning)
    // Approximate 80% input, 20% output
    const inputTokens = estimatedTokens * 0.8;
    const outputTokens = estimatedTokens * 0.2;
    const estimatedCost = (inputTokens / 1_000_000) * 0.20 + (outputTokens / 1_000_000) * 0.50;

    return {
        entities: estimatedEntities,
        variables: estimatedVariables,
        functions: estimatedFunctions,
        batches: totalBatches,
        tokens: estimatedTokens,
        cost: estimatedCost
    };
}

// FIX P2-2: Make AST serialization optional (saves 320MB+ memory for large files)
if (config.dumpAST) {
    console.log('  Dumping AST to JSON (this may take a while for large files)...');
    fs.writeFileSync(`${processingFileName}.ast.before.json`, JSON.stringify(ast, null, 2));
}

const jsGen = new CodeGenerator(ast, config.codeGenerator, "");

// Helper: Ask user for confirmation
function askUserConfirmation(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().trim());
        });
    });
}

// Initialize Grok interface if API key is available
let grokInterface = null;
let grokEnabled = false;
if (process.env.XAI_API_KEY && config.useGrokForVariables !== false) {
    // Estimate cost BEFORE initializing Grok
    const costEstimate = estimateGrokCost(astStats.nodeCount);

    console.log('\n💰 Grok Analysis Cost Estimate');
    console.log('==============================');
    console.log(`AST nodes: ${astStats.nodeCount.toLocaleString()}`);
    console.log(`Estimated entities: ~${costEstimate.entities.toLocaleString()} (${costEstimate.variables} vars, ${costEstimate.functions} funcs)`);
    console.log(`API calls: ~${costEstimate.batches} batches`);
    console.log(`Estimated tokens: ~${costEstimate.tokens.toLocaleString()}`);
    console.log(`Estimated cost: $${costEstimate.cost.toFixed(4)}`);

    // Ask for confirmation if cost > $0.10
    if (costEstimate.cost > 0.10) {
        console.log(`\n⚠️  Warning: Estimated cost is $${costEstimate.cost.toFixed(4)}`);
        console.log('This is above the safety threshold ($0.10)');
        // Set flag to ask later in async section
        grokEnabled = 'ASK_USER';
    } else {
        console.log('✓ Cost is within safety threshold ($0.10)');
        grokEnabled = true;
    }

    if (grokEnabled === true) {
        try {
            grokInterface = new GrokInterface({
                apiKey: process.env.XAI_API_KEY,
                model: 'grok-4-fast-reasoning'
            });
        } catch (err) {
            console.warn(`Warning: Failed to initialize Grok: ${err.message}`);
        }
    }
}

// FIX: Use context object instead of global state
// This prevents scope pollution between multiple file processing
const processingContext = {
    astScopes: {},  // Scope storage (replaces global.astScopes)
    config: config,
    sourceFileName: processingFileName,  // For webpack bundle unpacking
    grokInterface: grokInterface  // For Grok-based variable renaming
};

// Pre-step: Unpack bundles FIRST (before scope analysis)
// This is critical for malware analysis - unpacks webpack/AMD/UMD bundles
let status = traverseTopDown(
    ast,
    [
        extractNestedBundles,  // Extract bundle-in-bundle strings first
        unpackBundles,         // Then unwrap bundled code
        removeLocationInformation
    ],
    processingContext
);

status = traverseTopDown(
    ast,
    [
        createScopes,
        defineFunctions,
        assignValuesToVariables
    ],
    processingContext
);


status = traverseTopDown(
    ast,
    [
        countFunctionInvocations,
        recoverBooleans,
        deobfuscateStrings  // NEW: Decode hex/unicode/octal escapes
    ],
    processingContext
);

let trial = 0;
const MAX_ITERATIONS = config.maxIterations || 100; // configurable safety limit
const TIMEOUT_MS = config.timeoutMs || 300000; // 5 minutes default
const convergenceStartTime = Date.now();

while (trial < MAX_ITERATIONS) {
    trial++;

    // FIX P2-1: Add timeout protection against malware anti-analysis
    const elapsed = Date.now() - convergenceStartTime;
    if (elapsed > TIMEOUT_MS) {
        console.warn(`\n⚠️  WARNING: Convergence timeout after ${trial} iterations (${elapsed}ms)`);
        console.warn(`   This may indicate malware anti-analysis tricks.`);
        console.warn(`   Stopping to prevent infinite analysis.`);
        break;
    }

    console.log(`Iteration ${trial}... (${(elapsed / 1000).toFixed(1)}s elapsed)`);

    // Fresh variable for THIS iteration only
    // OPTIMIZATION: Single traversal with multiple mutators (3x faster!)
    let changedInThisIteration = traverseBottomUp(
        ast,
        [
            fixControlFlowStatementsWithOneStatement,
            replaceSequentialAssignments,
            replaceSequentialAssignmentsInFlowControl,
            inlineStringArrayAccess,  // NEW: accessor(0) → arr[0]
            foldConstants,            // NEW: Evaluate constant expressions (2+3 → 5)
            eliminateDeadCode,        // NEW: Remove unreachable code (after constants folded)
            simplifyPropertyAccess    // NEW: obj['prop'] → obj.prop
        ],
        processingContext
    );

    // If NOTHING changed in this iteration - convergence reached
    if (!changedInThisIteration) {
        console.log(`✓ Converged after ${trial} iterations.`);
        break;
    }

    if (config.verbose) {
        console.log(`  → Changes detected, continuing...`);
    }
}

if (trial === MAX_ITERATIONS) {
    console.warn(`⚠ WARNING: Reached max iterations (${MAX_ITERATIONS}) without convergence`);
}

// Continue processing (async for Grok support)
(async function() {
    // Handle deferred user confirmation for expensive operations
    if (grokEnabled === 'ASK_USER') {
        const answer = await askUserConfirmation('\nProceed with Grok analysis? (y/n): ');

        if (answer === 'y' || answer === 'yes') {
            console.log('✓ User confirmed. Initializing Grok...');
            try {
                grokInterface = new GrokInterface({
                    apiKey: process.env.XAI_API_KEY,
                    model: 'grok-4-fast-reasoning'
                });
                // Update context with new grokInterface
                processingContext.grokInterface = grokInterface;
                grokEnabled = true;
            } catch (err) {
                console.error(`Error initializing Grok: ${err.message}`);
                grokEnabled = false;
            }
        } else {
            console.log('✗ User declined. Skipping Grok analysis.');
            grokEnabled = false;
        }
    }

    // Grok-based semantic renaming (variables + functions)
    if (grokInterface && grokEnabled && config.useGrokForVariables !== false) {
        console.log('\n🤖 Grok Semantic Renaming Phase');
        console.log('=================================');

        try {
            let variablesRenamed = false;
            let functionsRenamed = false;

            // Step 1: Analyze variables with Grok
            console.log('\n[Phase 1] Variable Analysis');
            variablesRenamed = await renameVariablesWithGrok(
                ast,
                processingContext,
                { last: () => null }
            );

            if (variablesRenamed) {
                console.log('✓ Grok variable analysis complete');
            }

            // Step 2: Analyze functions with Grok (batched, cost-optimized)
            console.log('\n[Phase 2] Function Analysis');
            functionsRenamed = await renameFunctionsWithGrok(
                ast,
                processingContext,
                { last: () => null }
            );

            if (functionsRenamed) {
                console.log('✓ Grok function analysis complete');
            }

            // Step 3: Apply ALL renames in single traversal (optimization!)
            if (variablesRenamed || functionsRenamed) {
                console.log('\n[Phase 3] Applying renames...');
                traverseTopDown(
                    ast,
                    [applyFunctionRenames, renameVariables],
                    processingContext
                );
                console.log('✓ Semantic renaming complete');
            }

            // Generate malware report AFTER renames applied
            const malwareReport = generateMalwareReport(processingContext, processingFileName);
            console.log(formatReportConsole(malwareReport));

            // Save markdown report
            const reportPath = `${processingFileName}.malware-report.md`;
            const markdownReport = formatReportMarkdown(malwareReport);
            fs.writeFileSync(reportPath, markdownReport);
            console.log(`📄 Malware report saved: ${reportPath}\n`);

            // Display cost report
            if (grokInterface) {
                const stats = grokInterface.getTotalStats();
                console.log('💰 Grok Cost Report');
                console.log('===================');
                console.log(`Model: ${stats.model}`);
                console.log(`API calls: ${stats.api_calls}`);
                console.log(`Total tokens: ${stats.total_tokens.toLocaleString()}`);
                console.log(`  Input: ${stats.input_tokens.toLocaleString()}`);
                console.log(`  Output: ${stats.output_tokens.toLocaleString()}`);
                console.log(`Total cost: $${stats.total_cost.toFixed(6)}`);
                console.log(`  Per-token rate: $${stats.pricing.input.toFixed(2)}/M in, $${stats.pricing.output.toFixed(2)}/M out`);
            }
        } catch (error) {
            console.error(`⚠️  Grok semantic renaming failed: ${error.message}`);
        }
    }

    dumpScopes(processingContext.astScopes, null);

    // Painting of variables
    // traverse(
    //     ast,
    //     [
    //         createScopes,
    //         assignValuesToVariables,
    //         renameVariables
    //     ], {config});

    // Dumping scopes of variables
    // traverse(ast,dumpScopes, {config});

    // FIX P2-2: Make AST dump optional
    if (config.dumpAST) {
        console.log('  Dumping processed AST to JSON...');
        fs.writeFileSync(`${processingFileName}.ast.after.json`, JSON.stringify(ast, (k, v) => ['parentNode', 'parentNodeProperty'].includes(k) ? null : v, 2));
    }
    // fs.writeFileSync('./scopes.json', JSON.stringify(global.astScopes, (k,v) => ['parent'].includes(k) ? null : v, 2));

    // FIX: Cleanup parent references to prevent memory leak
    // This allows AST to be garbage collected after processing
    cleanupParentReferences(ast);
    cleanupContext(processingContext);

    const outputFilePath = `${processingFileName}.out`;

    Utils.createAllFoldersInPath(outputFilePath);

    let res = null;
    try {
        console.log("Generating code...")
        res = jsGen.generate();
    //    res = astring.generate(ast);
        // res = generate(ast, {});
    } catch(ex) {
        console.log("ERROR:", ex.stack);
    }

    if (res) {
        console.log("Writing generated code...")

        try {
            fs.writeFileSync(outputFilePath, res.code);
            console.log(`✓ Saved into ${outputFilePath}`);
            process.exit(0);
        } catch (err) {
            console.log(`ERROR: Cannot save into ${outputFilePath}`);
            console.error(err);
            process.exit(1);
        }
    } else {
        process.exit(1);
    }
})().catch(err => {
    console.error("FATAL ERROR:", err.stack);
    process.exit(1);
});
