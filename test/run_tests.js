#!/usr/bin/env node
"use strict";

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CASES_DIR = path.join(__dirname, 'cases');
const TEMP_DIR = path.join(__dirname, 'temp');
const ROOT_DIR = path.join(__dirname, '..');

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function log(color, ...args) {
    console.log(color, ...args, colors.reset);
}

function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

function cleanTempDir() {
    if (fs.existsSync(TEMP_DIR)) {
        const files = fs.readdirSync(TEMP_DIR);
        files.forEach(file => {
            fs.unlinkSync(path.join(TEMP_DIR, file));
        });
    }
}

function getAllTestCases() {
    return fs.readdirSync(CASES_DIR)
        .filter(file => file.endsWith('.js'))
        .sort();
}

function runTest(testFile) {
    const testName = path.basename(testFile, '.js');
    const inputPath = path.join(CASES_DIR, testFile);
    const outputPath = `${inputPath}.out`; // app.js creates .out next to input file

    log(colors.cyan, `\n${'='.repeat(60)}`);
    log(colors.cyan, `Testing: ${testName}`);
    log(colors.cyan, '='.repeat(60));

    const result = {
        name: testName,
        passed: false,
        error: null,
        iterations: null,
        converged: false,
        outputValid: false,
        details: []
    };

    try {
        // Run deobfuscator
        log(colors.gray, 'Running deobfuscator...');
        const startTime = Date.now();
        const output = execSync(
            `node "${path.join(ROOT_DIR, 'app.js')}" "${inputPath}"`,
            {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: ROOT_DIR
            }
        );
        const duration = Date.now() - startTime;

        result.details.push(`Duration: ${duration}ms`);

        // Parse output for convergence info
        const iterationMatch = output.match(/Iteration (\d+)\.\.\./g);
        const iterations = iterationMatch ? iterationMatch.length : 0;
        result.iterations = iterations;
        result.details.push(`Iterations: ${iterations}`);

        const convergedMatch = output.match(/✓ Converged after (\d+) iterations/);
        if (convergedMatch) {
            result.converged = true;
            result.details.push(`Converged: Yes (after ${convergedMatch[1]} iterations)`);
        } else {
            result.details.push(`Converged: No`);
        }

        const warningMatch = output.match(/⚠ WARNING: Reached max iterations/);
        if (warningMatch) {
            result.details.push(`⚠ Hit max iterations limit!`);
        }

        // Check if output file was generated
        if (fs.existsSync(outputPath)) {
            result.details.push('Output file: Generated');

            // Validate output is syntactically correct JavaScript
            try {
                const outputCode = fs.readFileSync(outputPath, 'utf8');
                require('@babel/parser').parse(outputCode);
                result.outputValid = true;
                result.details.push('Syntax: Valid');
            } catch (parseError) {
                result.outputValid = false;
                result.details.push(`Syntax: Invalid - ${parseError.message}`);
            }
        } else {
            result.details.push('Output file: Missing');
        }

        // Test is considered passed if:
        // 1. No errors
        // 2. Converged OR iterations < 10
        // 3. Output is valid JavaScript
        result.passed = result.converged && result.outputValid;

        if (result.passed) {
            log(colors.green, `✓ PASSED`);
        } else {
            log(colors.yellow, `⚠ COMPLETED WITH ISSUES`);
        }

    } catch (error) {
        result.error = error.message;
        result.details.push(`Error: ${error.message}`);
        log(colors.red, `✗ FAILED: ${error.message}`);
    }

    // Print details
    result.details.forEach(detail => {
        log(colors.gray, `  ${detail}`);
    });

    return result;
}

function printSummary(results) {
    log(colors.cyan, `\n${'='.repeat(60)}`);
    log(colors.cyan, 'TEST SUMMARY');
    log(colors.cyan, '='.repeat(60));

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach(result => {
        const status = result.passed
            ? `${colors.green}✓ PASS${colors.reset}`
            : result.error
                ? `${colors.red}✗ FAIL${colors.reset}`
                : `${colors.yellow}⚠ ISSUE${colors.reset}`;

        const convergence = result.converged
            ? `converged in ${result.iterations} iterations`
            : result.iterations
                ? `did not converge (${result.iterations} iterations)`
                : 'unknown';

        console.log(`${status} ${result.name} - ${convergence}`);
    });

    log(colors.cyan, '\n' + '='.repeat(60));
    const successRate = ((passed / total) * 100).toFixed(0);
    const summaryColor = passed === total ? colors.green : passed > 0 ? colors.yellow : colors.red;
    log(summaryColor, `Results: ${passed}/${total} passed (${successRate}%)`);
    log(colors.cyan, '='.repeat(60) + '\n');

    return passed === total;
}

function main() {
    log(colors.blue, '\n' + '='.repeat(60));
    log(colors.blue, 'JS RECOVER - TEST RUNNER');
    log(colors.blue, '='.repeat(60) + '\n');

    // Setup
    ensureTempDir();
    if (process.argv.includes('--clean')) {
        log(colors.gray, 'Cleaning temp directory...');
        cleanTempDir();
    }

    // Get test cases
    const testCases = getAllTestCases();
    log(colors.gray, `Found ${testCases.length} test case(s)\n`);

    // Run tests
    const results = testCases.map(testFile => runTest(testFile));

    // Summary
    const allPassed = printSummary(results);

    // Exit code
    process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
    main();
}
