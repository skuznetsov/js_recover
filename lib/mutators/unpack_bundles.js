const t = require('@babel/types');
const Utils = require('../utils');
const fs = require('fs');
const path = require('path');
const CodeGenerator = require('@babel/generator').CodeGenerator;

/**
 * BUNDLE UNPACKER - Critical for malware analysis
 *
 * Detects and unpacks common JavaScript bundle patterns:
 * - Webpack bundles: (function(modules) {...})([...])
 * - AMD/RequireJS: !(function(e) { define/require })(this)
 * - UMD pattern: (function(root, factory) {...})
 * - Closure Compiler: (function(_) {...})(this)
 * - Simple IIFE wrappers
 *
 * Purpose: Malware often hides in bundled code. Unpacking reveals
 * true structure for analysis.
 */

/**
 * Detects if an IIFE matches webpack bundle pattern
 * Pattern: (function(modules) { loader_code; return __webpack_require__(0); })([...modules...])
 */
function isWebpackBundle(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    // Support both FunctionExpression and ArrowFunctionExpression (modern webpack/minifiers)
    if (callee.type !== 'FunctionExpression' && callee.type !== 'ArrowFunctionExpression') return false;

    // Check for single parameter (modules container: array or object)
    if (callee.params.length !== 1) return false;

    // Check for array OR object argument (the modules)
    if (node.arguments.length !== 1) return false;
    const modulesArg = node.arguments[0];
    if (modulesArg.type !== 'ArrayExpression' && modulesArg.type !== 'ObjectExpression') {
        return false;
    }

    // Check for __webpack_require__ or similar loader pattern in function body
    const bodyCode = JSON.stringify(callee.body);
    if (bodyCode.includes('__webpack_require__') ||
        bodyCode.includes('webpackJsonp') ||
        bodyCode.includes('__WEBPACK')) {
        return {
            type: 'webpack',
            modulesParam: callee.params[0].name,
            modulesContainer: modulesArg,
            isObjectBased: modulesArg.type === 'ObjectExpression',
            loaderFunc: callee
        };
    }

    return false;
}

/**
 * Detects webpack bundle via STRUCTURAL analysis (no keywords needed)
 * This is more robust than keyword detection and works on fully obfuscated bundles
 *
 * Pattern: (function(modules) { cache; loader; return loader(0); })([...] or {...})
 *
 * Structural invariants:
 * 1. IIFE with single parameter
 * 2. Parameter receives array or object
 * 3. Body contains: cache object, loader function, module.call(), .exports
 */
function isWebpackBundleStructural(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    // Support both FunctionExpression and ArrowFunctionExpression (modern webpack/minifiers)
    if (callee.type !== 'FunctionExpression' && callee.type !== 'ArrowFunctionExpression') return false;

    // Check for single parameter (modules container)
    if (callee.params.length !== 1) return false;

    // Check for array OR object argument (the modules)
    if (node.arguments.length !== 1) return false;
    const modulesArg = node.arguments[0];
    if (modulesArg.type !== 'ArrayExpression' && modulesArg.type !== 'ObjectExpression') {
        return false;
    }

    // Check for loader pattern via structural invariants (not keywords!)
    // Note: bodyCode is JSON representation of AST, not source code
    const bodyCode = JSON.stringify(callee.body);

    // Invariant 1: Module cache (var cache = {})
    // In AST JSON: {"type":"VariableDeclarator",...,"init":{"type":"ObjectExpression"
    const hasCache = /"type":"VariableDeclarator".*?"init":\{"type":"ObjectExpression"/.test(bodyCode);

    // Invariant 2: Loader function definition
    // In AST JSON: {"type":"FunctionDeclaration","id":{"type":"Identifier"
    const hasLoader = /"type":"FunctionDeclaration".*?"id":\{"type":"Identifier"/.test(bodyCode);

    // Invariant 3: Module invocation pattern (modules[id].call(...))
    // In AST JSON: "property":{"type":"Identifier","name":"call"}
    // Simplified pattern without escaping braces
    const hasModuleCall = /"name":"call"/.test(bodyCode) && /"type":"CallExpression"/.test(bodyCode);

    // Invariant 4: MemberExpression (property access like .exports, .e, etc.)
    // In AST JSON: {"type":"MemberExpression"
    const hasPropertyAccess = /"type":"MemberExpression"/.test(bodyCode);

    // Invariant 5: Return statement (return loader(X))
    const hasReturn = /"type":"ReturnStatement"/.test(bodyCode);

    // Invariant 6: Assignment to object literal
    // In AST JSON: AssignmentExpression with ObjectExpression
    const hasObjectAssignment = /"type":"AssignmentExpression".*?"type":"ObjectExpression"/.test(bodyCode);

    // All structural invariants must be present
    if (hasCache && hasLoader && hasModuleCall && hasPropertyAccess && hasReturn && hasObjectAssignment) {
        return {
            type: 'webpack',
            modulesParam: callee.params[0].name,
            modulesContainer: modulesArg,
            isObjectBased: modulesArg.type === 'ObjectExpression',
            loaderFunc: callee,
            detectionMethod: 'structural'  // Mark as structurally detected
        };
    }

    return false;
}

/**
 * Detects webpack 5+ pattern (modern webpack with modules defined inside)
 * Pattern: (() => { var modules = {...}; function __webpack_require__(id) {...}; return __webpack_require__(entry); })()
 *
 * Key differences from webpack 4:
 * - Arrow function or function with 0 parameters (not 1)
 * - 0 arguments (not 1)
 * - Modules defined INSIDE as variable, not passed as argument
 */
function isWebpack5Bundle(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (callee.type !== 'FunctionExpression' && callee.type !== 'ArrowFunctionExpression') return false;

    // Webpack 5: IIFE with 0 parameters and 0 arguments
    if (callee.params.length !== 0) return false;
    if (node.arguments.length !== 0) return false;

    // Must have BlockStatement body (not concise arrow function)
    if (callee.body.type !== 'BlockStatement') return false;

    // Check for __webpack_require__ in function body
    const bodyCode = JSON.stringify(callee.body);
    if (!bodyCode.includes('__webpack_require__')) return false;

    // Look for modules object definition pattern: var X = { numeric_keys: functions }
    // In AST JSON: {"type":"VariableDeclarator","init":{"type":"ObjectExpression","properties":[...]}}
    const hasModulesObject = /"type":"VariableDeclarator".*?"init":\{"type":"ObjectExpression"/.test(bodyCode);

    if (!hasModulesObject) return false;

    // Try to find the modules variable name
    // Look for: var X = { ... } where X is referenced by __webpack_require__
    // For now, we'll extract modules during unwrapping

    return {
        type: 'webpack5',
        isObjectBased: true,
        loaderFunc: callee,
        modulesContainer: null,  // Will be found during extraction
        detectionMethod: 'webpack5-pattern'
    };
}

/**
 * Detects webpackJsonp chunk files (code splitting)
 * Pattern: (window.webpackJsonp=window.webpackJsonp||[]).push([[chunkId], {...modules...}])
 * OR: webpackJsonp([chunkId], {...modules...})
 */
function isWebpackChunk(node) {
    if (node.type !== 'CallExpression') return false;

    // Pattern 1: (window.webpackJsonp = ...).push([...])
    if (node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.name === 'push') {

        const objCode = JSON.stringify(node.callee.object);
        if (objCode.includes('webpackJsonp')) {
            // Arguments: [[chunkIds...], {modules...}, ...]
            if (node.arguments.length >= 1) {
                const firstArg = node.arguments[0];
                if (firstArg.type === 'ArrayExpression' && firstArg.elements.length >= 2) {
                    const chunkIds = firstArg.elements[0];
                    const modules = firstArg.elements[1];

                    if (modules && (modules.type === 'ObjectExpression' || modules.type === 'ArrayExpression')) {
                        return {
                            type: 'webpack_chunk',
                            chunkIds: chunkIds,
                            modulesContainer: modules,
                            isObjectBased: modules.type === 'ObjectExpression'
                        };
                    }
                }
            }
        }
    }

    // Pattern 2: webpackJsonp([chunkId], {modules})
    if (node.callee.type === 'Identifier' && node.callee.name === 'webpackJsonp') {
        if (node.arguments.length >= 2) {
            const modules = node.arguments[1];
            if (modules && (modules.type === 'ObjectExpression' || modules.type === 'ArrayExpression')) {
                return {
                    type: 'webpack_chunk',
                    chunkIds: node.arguments[0],
                    modulesContainer: modules,
                    isObjectBased: modules.type === 'ObjectExpression'
                };
            }
        }
    }

    return false;
}

/**
 * Detects AMD/RequireJS pattern
 * Pattern: !(function(e) { define = ...; require = ...; })(this)
 */
function isAMDBundle(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (callee.type !== 'FunctionExpression') return false;

    // Check for typical AMD assignment patterns
    const bodyCode = JSON.stringify(callee.body);
    if ((bodyCode.includes('define') && bodyCode.includes('require')) ||
        bodyCode.includes('define.amd') ||
        bodyCode.includes('AMDLoader')) {
        return {
            type: 'amd',
            wrapper: callee,
            args: node.arguments
        };
    }

    return false;
}

/**
 * Detects UMD (Universal Module Definition) pattern
 * Pattern: (function(root, factory) { if (typeof define ...) })(this, function() {...})
 */
function isUMDBundle(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (callee.type !== 'FunctionExpression') return false;

    // UMD typically has 2 params: root and factory
    if (callee.params.length !== 2) return false;

    const bodyCode = JSON.stringify(callee.body);
    if (bodyCode.includes('define.amd') &&
        bodyCode.includes('exports') &&
        node.arguments.length >= 2) {
        return {
            type: 'umd',
            wrapper: callee,
            factoryFunc: node.arguments[1]
        };
    }

    return false;
}

/**
 * Detects Google Closure Compiler style
 * Pattern: (function(_) { _. aa = ...; _.ba = ...; })(this._=this._||{})
 */
function isClosureBundle(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (callee.type !== 'FunctionExpression') return false;

    // Closure pattern often has assignment expressions in body
    // and passes namespace object as argument
    if (callee.params.length === 1 && node.arguments.length === 1) {
        const bodyCode = JSON.stringify(callee.body);
        const paramName = callee.params[0].name;

        // Check if param is used heavily for assignments (_.something = ...)
        const assignmentPattern = new RegExp(`${paramName}\\.\\w+\\s*=`, 'g');
        const matches = bodyCode.match(assignmentPattern);

        if (matches && matches.length > 10) {
            return {
                type: 'closure',
                namespace: paramName,
                wrapper: callee,
                namespaceArg: node.arguments[0]
            };
        }
    }

    return false;
}

/**
 * Detects simple IIFE wrapper (common in obfuscated malware)
 * Pattern: (function() { actual_code })()
 */
function isSimpleIIFE(node) {
    if (node.type !== 'CallExpression') return false;

    const callee = node.callee;
    if (callee.type !== 'FunctionExpression' &&
        callee.type !== 'ArrowFunctionExpression') return false;

    // Simple IIFE: no params or minimal params, self-executing
    if (callee.params.length <= 2 && node.arguments.length <= 2) {
        return {
            type: 'iife',
            wrapper: callee
        };
    }

    return false;
}

/**
 * Main unpacker function
 * Unwraps IIFE bundles to expose underlying code structure
 */
function unpackBundles(node, opts, parentStack) {
    // Check if feature is enabled
    if (opts.config && opts.config.unpackBundles === false) {
        return false;
    }

    const parent = parentStack.last()?.node;

    // Only process top-level or expression statement calls
    if (!parent ||
        (parent.type !== 'Program' &&
         parent.type !== 'ExpressionStatement' &&
         parent.type !== 'UnaryExpression')) {
        return false;
    }

    let bundleInfo = null;

    // Try to detect bundle type
    // Priority: chunks first (most specific), then bundles, then structural
    bundleInfo = isWebpackChunk(node) ||            // webpackJsonp chunks (code splitting)
                 isWebpack5Bundle(node) ||           // webpack 5+ (modules inside, no args)
                 isWebpackBundle(node) ||            // webpack 4 and earlier (modules as arg)
                 isWebpackBundleStructural(node) ||  // Structural detection for obfuscated bundles
                 isAMDBundle(node) ||
                 isUMDBundle(node) ||
                 isClosureBundle(node);

    if (!bundleInfo) return false;

    if (opts.config && opts.config.verbose) {
        const detectionMethod = bundleInfo.detectionMethod || 'keyword';
        console.log(`[Bundle Unpacker] Detected ${bundleInfo.type} bundle (${detectionMethod} analysis)`);
    }

    let changed = false;

    // Unwrap based on type
    switch (bundleInfo.type) {
        case 'webpack5':
            // Webpack 5+ with modules defined inside - need special extraction
            changed = unwrapWebpack5Bundle(node, bundleInfo, parentStack, opts);
            break;

        case 'webpack':
            changed = unwrapWebpackBundle(node, bundleInfo, parentStack, opts);
            break;

        case 'webpack_chunk':
            // Same unwrapping logic as webpack bundle, but mark as chunk
            changed = unwrapWebpackBundle(node, bundleInfo, parentStack, opts);
            break;

        case 'amd':
        case 'umd':
        case 'closure':
            // For these types, extract the function body and replace the IIFE
            changed = unwrapIIFE(node, bundleInfo, parentStack, opts);
            break;

        case 'iife':
            // Only unwrap simple IIFEs if they're truly trivial
            if (bundleInfo.wrapper.body.body &&
                bundleInfo.wrapper.body.body.length > 0) {
                changed = unwrapIIFE(node, bundleInfo, parentStack, opts);
            }
            break;
    }

    return changed;
}

/**
 * Unwrap webpack bundle by extracting modules to separate folder
 * Creates: input_file.js.unpacked/module_0.js, module_1.js, etc.
 * Supports both array-based and object-based bundles
 */
/**
 * Unwraps webpack 5+ bundles where modules are defined inside the IIFE
 * Pattern: (() => { var modules = {...}; function __webpack_require__(id) {...} })()
 */
function unwrapWebpack5Bundle(node, bundleInfo, parentStack, opts) {
    // Extract modules object from function body
    // Pattern: var X = { "17967": fn, "79742": fn, ... }
    const loaderFunc = bundleInfo.loaderFunc;
    if (!loaderFunc.body || !loaderFunc.body.body) return false;

    // Find first VariableDeclaration with ObjectExpression init
    let modulesObject = null;
    for (const stmt of loaderFunc.body.body) {
        if (stmt.type === 'VariableDeclaration') {
            for (const decl of stmt.declarations) {
                if (decl.init && decl.init.type === 'ObjectExpression' && decl.init.properties.length > 10) {
                    // Found likely modules object (has many properties)
                    modulesObject = decl.init;
                    break;
                }
            }
        }
        if (modulesObject) break;
    }

    if (!modulesObject) {
        console.log('[Webpack5] Could not find modules object in function body');
        return false;
    }

    // Extract modules from object properties
    const modules = modulesObject.properties.map(prop => ({
        id: prop.key.value || prop.key.name,
        func: prop.value
    }));

    if (modules.length === 0) return false;

    console.log(`[Webpack] Unpacking ${modules.length} modules to ${opts.sourceFileName}.unpacked/`);

    // Save modules to separate files
    let savedToFolder = false;
    if (opts.sourceFileName && opts.config.unpackBundlesToFolders !== false) {
        try {
            saveWebpackModulesToFolder(modules, opts);
            savedToFolder = true;
        } catch (err) {
            console.error(`[Webpack] Error saving to folder: ${err.message}`);
        }
    }

    // If saved to folder, replace bundle with comment
    if (savedToFolder) {
        const parentStackNode = parentStack.last();
        const grandParentStackNode = parentStack.last(1);

        if (grandParentStackNode && grandParentStackNode.node.type === 'Program') {
            // Replace with empty statement
            Utils.replaceChildInParentNode(t.emptyStatement(), parentStackNode, 1);
            return true;
        }
    }

    return false;
}

function unwrapWebpackBundle(node, bundleInfo, parentStack, opts) {
    // Extract modules from array or object
    let modules;
    if (bundleInfo.isObjectBased) {
        // Object: { "a5f": fn1, "b2c": fn2, ... }
        modules = bundleInfo.modulesContainer.properties.map(prop => ({
            id: prop.key.value || prop.key.name,
            func: prop.value
        }));
    } else {
        // Array: [fn1, fn2, fn3, ...]
        modules = bundleInfo.modulesContainer.elements.map((elem, idx) => ({
            id: idx,
            func: elem
        }));
    }

    if (opts.config && opts.config.verbose) {
        const containerType = bundleInfo.isObjectBased ? 'object' : 'array';
        console.log(`[Webpack] Found ${modules.length} modules (${containerType}-based)`);
    }

    if (modules.length === 0) return false;

    // Save modules to separate files if filename is provided
    let savedToFolder = false;
    if (opts.sourceFileName && opts.config.unpackBundlesToFolders !== false) {
        try {
            saveWebpackModulesToFolder(modules, opts);
            savedToFolder = true;
        } catch (err) {
            console.error(`[Webpack] Error saving to folder: ${err.message}`);
            // Fall back to inline mode
        }
    }

    // If saved to folder, replace bundle with comment
    if (savedToFolder) {
        const parentStackNode = parentStack.last();
        const grandParentStackNode = parentStack.last(1);

        if (grandParentStackNode && grandParentStackNode.node.type === 'Program') {
            // Replace with empty statement (will be removed by dead code eliminator)
            Utils.replaceChildInParentNode(t.emptyStatement(), parentStackNode, 1);
            return true;
        }
        return false;
    }

    // Convert modules to inline function declarations (fallback mode)
    // Used when folder unpacking is disabled or fails
    const moduleDeclarations = modules.map((mod) => {
        if (mod && mod.func && mod.func.type === 'FunctionExpression') {
            return t.functionDeclaration(
                t.identifier(`__webpack_module_${mod.id}`),
                mod.func.params,
                mod.func.body
            );
        }
        return null;
    }).filter(Boolean);

    if (moduleDeclarations.length === 0) return false;

    const parentStackNode = parentStack.last();
    const grandParentStackNode = parentStack.last(1);

    if (grandParentStackNode && grandParentStackNode.node.type === 'Program') {
        // Insert modules one by one to avoid array nesting issues
        for (let i = moduleDeclarations.length - 1; i >= 0; i--) {
            Utils.replaceChildInParentNode(moduleDeclarations[i], parentStackNode, i === 0 ? 1 : 0);
        }

        if (opts.config && opts.config.verbose) {
            console.log(`[Webpack] Unpacked ${moduleDeclarations.length} modules inline`);
        }
        return true;
    }

    return false;
}

/**
 * Analyze module content and suggest a smart name
 */
function analyzeModuleName(moduleNode, idx, opts) {
    const body = moduleNode.body;
    if (!body || !body.body) {
        return { name: `module_${idx}`, confidence: 'low', reason: 'empty' };
    }

    const code = JSON.stringify(body);
    const exports = [];
    const keywords = [];

    // Extract export names
    const exportMatches = code.match(/exports\.\w+/g) || [];
    exportMatches.forEach(exp => {
        const name = exp.replace('exports.', '');
        if (!exports.includes(name)) exports.push(name);
    });

    // Detect patterns
    const patterns = [
        { keywords: ['fetch', 'request', 'http', 'api', 'ajax'], name: 'api_client' },
        { keywords: ['auth', 'login', 'token', 'credential'], name: 'auth' },
        { keywords: ['route', 'router', 'path', 'navigate'], name: 'router' },
        { keywords: ['render', 'component', 'dom', 'element'], name: 'ui' },
        { keywords: ['store', 'state', 'redux', 'dispatch'], name: 'store' },
        { keywords: ['util', 'helper', 'tool', 'common'], name: 'utils' },
        { keywords: ['validate', 'check', 'verify', 'sanitize'], name: 'validation' },
        { keywords: ['crypto', 'encrypt', 'decrypt', 'hash'], name: 'crypto' },
        { keywords: ['socket', 'websocket', 'io', 'realtime'], name: 'socket' },
        { keywords: ['logger', 'log', 'debug', 'trace'], name: 'logger' },
        { keywords: ['config', 'setting', 'option', 'env'], name: 'config' },
        { keywords: ['parse', 'parser', 'serialize'], name: 'parser' },
        { keywords: ['format', 'transform', 'convert'], name: 'formatter' },
        { keywords: ['error', 'exception', 'throw'], name: 'error_handler' },
        // Malware-specific patterns (more specific to reduce false positives)
        { keywords: ['\\beval\\s*\\(', '\\bnew\\s+Function\\s*\\(', 'executeCode', 'runCode'], name: 'SUSPICIOUS_executor', malware: true },
        { keywords: ['\\batob\\s*\\(', '\\bbtoa\\s*\\(', 'fromCharCode.*join', 'decodeBase64'], name: 'SUSPICIOUS_decoder', malware: true },
        { keywords: ['exfiltrate', 'steal', '\\.evil\\.', 'attacker', '/c2\\.'], name: 'SUSPICIOUS_exfil', malware: true },
        { keywords: ['document\\.write\\s*\\(', 'innerHTML\\s*=', 'outerHTML\\s*='], name: 'SUSPICIOUS_dom_inject', malware: true },
    ];

    let bestBenignMatch = null;
    let maxBenignScore = 0;
    let bestMalwareMatch = null;
    let maxMalwareScore = 0;

    for (const pattern of patterns) {
        let score = 0;
        const foundKeywords = [];

        for (const keyword of pattern.keywords) {
            const regex = new RegExp(keyword, 'i');
            if (regex.test(code)) {
                score++;
                foundKeywords.push(keyword);
            }
        }

        if (score > 0) {
            const match = {
                name: pattern.name,
                keywords: foundKeywords,
                malware: pattern.malware || false
            };

            // Separate malware and benign matches
            if (pattern.malware) {
                if (score > maxMalwareScore) {
                    maxMalwareScore = score;
                    bestMalwareMatch = match;
                }
            } else {
                if (score > maxBenignScore) {
                    maxBenignScore = score;
                    bestBenignMatch = match;
                }
            }
        }
    }

    // CRITICAL: Malware patterns ALWAYS take priority
    if (bestMalwareMatch) {
        return {
            name: bestMalwareMatch.name,
            confidence: maxMalwareScore >= 2 ? 'high' : 'medium',
            reason: `matched: ${bestMalwareMatch.keywords.join(', ')}`,
            malware: true
        };
    }

    // Use exports-based naming if available and no strong benign pattern match
    if (exports.length > 0 && maxBenignScore < 2) {
        const mainExport = exports[0];
        return {
            name: mainExport,
            confidence: 'medium',
            reason: `exports: ${exports.join(', ')}`,
            malware: false
        };
    }

    // Use benign pattern-based naming
    if (bestBenignMatch && maxBenignScore > 0) {
        return {
            name: bestBenignMatch.name,
            confidence: maxBenignScore >= 3 ? 'high' : 'medium',
            reason: `matched: ${bestBenignMatch.keywords.join(', ')}`,
            malware: false
        };
    }

    // Fallback to generic name
    return {
        name: `module_${idx}`,
        confidence: 'low',
        reason: 'no patterns matched'
    };
}

/**
 * Save webpack modules to separate folder structure with smart naming
 */
function saveWebpackModulesToFolder(modules, opts) {
    const inputFile = opts.sourceFileName;
    const outputFolder = `${inputFile}.unpacked`;

    // Create output folder
    if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
    }

    console.log(`[Webpack] Unpacking ${modules.length} modules to ${outputFolder}/`);

    let successCount = 0;
    const moduleMap = [];
    const usedNames = new Set();

    // First pass: analyze all modules and assign names
    const moduleNames = modules.map((mod) => {
        if (!mod || !mod.func || mod.func.type !== 'FunctionExpression') {
            return { id: mod.id, name: `empty_${mod.id}`, info: null };
        }

        const info = analyzeModuleName(mod.func, mod.id, opts);
        let finalName = info.name;

        // Handle name conflicts
        let suffix = 0;
        while (usedNames.has(finalName)) {
            suffix++;
            finalName = `${info.name}_${suffix}`;
        }
        usedNames.add(finalName);

        return { id: mod.id, name: finalName, info };
    });

    // Second pass: save modules with smart names
    modules.forEach((mod, arrayIdx) => {
        if (!mod || !mod.func || mod.func.type !== 'FunctionExpression') {
            return;
        }

        const { name: smartName, info } = moduleNames[arrayIdx];
        const moduleName = `${smartName}.js`;
        const modulePath = path.join(outputFolder, moduleName);

        try {
            // Generate code for this module
            const ast = t.program([
                t.functionDeclaration(
                    t.identifier(`module_${mod.id}`),
                    mod.func.params,
                    mod.func.body
                )
            ]);

            const generator = new CodeGenerator(ast, { bsd: true }, "");
            const result = generator.generate();

            // Add header comment with analysis info
            let header = `// Webpack Module ${mod.id}\n`;
            header += `// Extracted from: ${path.basename(inputFile)}\n`;
            if (info) {
                header += `// Auto-detected name: ${smartName} (${info.confidence} confidence)\n`;
                header += `// Reason: ${info.reason}\n`;
                if (info.malware) {
                    header += `// ⚠️  WARNING: SUSPICIOUS MALWARE PATTERN DETECTED!\n`;
                }
            }
            header += `\n`;

            const code = header + result.code;

            fs.writeFileSync(modulePath, code, 'utf8');
            moduleMap.push({ id: mod.id, name: smartName, info });
            successCount++;

            if (opts.config && opts.config.verbose) {
                const malwareFlag = info && info.malware ? ' ⚠️  SUSPICIOUS' : '';
                console.log(`  [${mod.id}] ${smartName}.js (${info.confidence})${malwareFlag}`);
            }
        } catch (err) {
            console.error(`[Webpack] Error saving module ${mod.id}: ${err.message}`);
        }
    });

    // Create index file with module map
    const suspiciousModules = moduleMap.filter(m => m.info && m.info.malware);

    let indexContent = `# Webpack Bundle Analysis
**Original file:** ${path.basename(inputFile)}
**Extracted modules:** ${successCount}/${modules.length}

`;

    if (suspiciousModules.length > 0) {
        indexContent += `## ⚠️  SUSPICIOUS MODULES DETECTED (${suspiciousModules.length})

${suspiciousModules.map(m => `- **${m.name}.js** (module ${m.id}) - ${m.info.reason}`).join('\n')}

`;
    }

    indexContent += `## Module Files

| ID | Filename | Confidence | Detection Reason |
|----|----------|------------|------------------|
${moduleMap.map(m => `| ${m.id} | ${m.name}.js | ${m.info.confidence} | ${m.info.reason} |`).join('\n')}

## Analysis Commands

\`\`\`bash
# Check for suspicious patterns
grep -r "eval\\|Function\\|atob" .

# Find network calls
grep -r "fetch\\|XMLHttpRequest\\|ajax" .

# Check crypto usage
grep -r "crypto\\|encrypt\\|decrypt" .
\`\`\`
`;

    fs.writeFileSync(path.join(outputFolder, 'README.md'), indexContent, 'utf8');

    // Save module mapping for post-processing (Grok renaming, etc.)
    const mappingData = {
        originalFile: path.basename(inputFile),
        timestamp: new Date().toISOString(),
        totalModules: modules.length,
        extractedModules: successCount,
        suspiciousCount: suspiciousModules.length,
        modules: moduleMap.map(m => ({
            id: m.id,
            filename: `${m.name}.js`,
            patternName: m.name,
            confidence: m.info.confidence,
            reason: m.info.reason,
            malware: m.info.malware || false,
            // Will be filled by Grok later
            grokName: null,
            grokReason: null,
            grokConfidence: null
        }))
    };

    fs.writeFileSync(
        path.join(outputFolder, 'mapping.json'),
        JSON.stringify(mappingData, null, 2),
        'utf8'
    );

    console.log(`✓ [Webpack] Saved ${successCount} modules to ${outputFolder}/`);
    if (suspiciousModules.length > 0) {
        console.log(`⚠️  [Webpack] WARNING: ${suspiciousModules.length} suspicious modules detected!`);
    }

    // Suggest Grok renaming if API key is available
    if (process.env.XAI_API_KEY && opts.config.useGrokForNaming !== false) {
        console.log(`💡 [Webpack] Tip: Run 'node scripts/rename_with_grok.js ${outputFolder}' for semantic naming`);
    }
}

/**
 * Unwrap IIFE by hoisting its body to parent scope
 */
function unwrapIIFE(node, bundleInfo, parentStack, opts) {
    const wrapper = bundleInfo.wrapper;
    const body = wrapper.body.body;

    if (!body || body.length === 0) return false;

    // Find the statement node to replace
    // CallExpression can be inside: ExpressionStatement or UnaryExpression (inside ExpressionStatement)
    let statementStackNode = null;
    let programStackNode = null;

    const parent = parentStack.last();
    const grandParent = parentStack.last(1);
    const greatGrandParent = parentStack.last(2);

    if (parent && parent.node.type === 'ExpressionStatement' &&
        grandParent && grandParent.node.type === 'Program') {
        // Direct: Program > ExpressionStatement > CallExpression
        statementStackNode = parent;
        programStackNode = grandParent;
    } else if (parent && parent.node.type === 'UnaryExpression' &&
               grandParent && grandParent.node.type === 'ExpressionStatement' &&
               greatGrandParent && greatGrandParent.node.type === 'Program') {
        // Wrapped: Program > ExpressionStatement > UnaryExpression > CallExpression
        statementStackNode = grandParent;
        programStackNode = greatGrandParent;
    }

    if (statementStackNode && programStackNode) {
        if (opts.config && opts.config.verbose) {
            console.log(`[Bundle Unpacker] Unwrapping ${bundleInfo.type}, hoisting ${body.length} statements`);
        }

        // Replace the ExpressionStatement with the IIFE body
        Utils.replaceChildInParentNode(body, statementStackNode, 1);
        return true;
    }

    return false;
}

module.exports = unpackBundles;
