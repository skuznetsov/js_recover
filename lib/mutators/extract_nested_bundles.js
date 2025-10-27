const t = require('@babel/types');
const parser = require('@babel/parser');
const Utils = require('../utils');
const fs = require('fs');
const path = require('path');

/**
 * NESTED BUNDLE EXTRACTOR
 *
 * Detects bundle code embedded as strings within modules
 * and extracts them for separate analysis.
 *
 * Pattern: var code = "(function(m){...})([...])";
 *          eval(code) or new Function(code)()
 */

/**
 * Checks if a string looks like a webpack bundle
 */
function looksLikeBundle(str) {
    if (typeof str !== 'string' || str.length < 50) return false;

    // Bundle indicators
    const hasIIFE = /\(function\s*\([^)]*\)\s*\{/.test(str);
    const hasModuleCall = /\.call\(/.test(str);
    const hasReturn = /return\s+\w+\(/.test(str);

    // Webpack-specific
    const hasWebpack = /__webpack_require__/.test(str) ||
                       /webpackJsonp/.test(str) ||
                       /installedModules/.test(str);

    // Generic module loader pattern
    const hasModuleLoader = hasIIFE && hasModuleCall && hasReturn;

    return hasWebpack || hasModuleLoader;
}

/**
 * Main mutator: extract nested bundles from string literals
 */
function extractNestedBundles(node, opts, parentStack) {
    // Look for string literals that contain bundle code
    if (node.type !== 'StringLiteral' && node.type !== 'TemplateLiteral') {
        return false;
    }

    let bundleCode = null;

    if (node.type === 'StringLiteral') {
        bundleCode = node.value;
    } else if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
        bundleCode = node.quasis[0].value.raw;
    }

    if (!bundleCode || !looksLikeBundle(bundleCode)) {
        return false;
    }

    // Found a nested bundle!
    const sourceFileName = opts.sourceFileName || 'unknown';
    const baseName = path.basename(sourceFileName, path.extname(sourceFileName));

    console.log(`[Nested Bundle] Found embedded bundle in ${baseName}...`);

    // Save nested bundle to separate file for analysis
    if (opts.config && opts.config.extractNestedBundles !== false) {
        try {
            const nestedFolder = `${sourceFileName}.nested`;
            if (!fs.existsSync(nestedFolder)) {
                fs.mkdirSync(nestedFolder, { recursive: true });
            }

            // Generate unique name based on position
            const parent = parentStack.last()?.node;
            const varName = parent && parent.type === 'VariableDeclarator' && parent.id.name ?
                            parent.id.name :
                            `bundle_${Math.random().toString(36).substr(2, 9)}`;

            const nestedFile = path.join(nestedFolder, `${varName}.nested.js`);
            fs.writeFileSync(nestedFile, bundleCode, 'utf8');

            console.log(`  → Extracted to: ${nestedFile}`);
            console.log(`  → Tip: Run 'node app.js ${nestedFile}' to analyze`);

            // Replace string with comment pointing to extracted file
            const comment = `/* NESTED BUNDLE EXTRACTED: ${path.basename(nestedFile)} */`;
            const replacement = t.stringLiteral(comment);

            Utils.replaceChildInParentNode(replacement, parentStack.last(), 0);
            return true;

        } catch (err) {
            console.error(`[Nested Bundle] Error extracting: ${err.message}`);
        }
    }

    return false;
}

module.exports = extractNestedBundles;
