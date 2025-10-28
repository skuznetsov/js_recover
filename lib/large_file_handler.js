/**
 * Large File Handler for js_recover
 * Detects large files and provides memory optimization strategies
 */

const fs = require('fs');

/**
 * File size thresholds (in bytes)
 */
const THRESHOLDS = {
    WARNING: 50 * 1024 * 1024,    // 50MB - warn user
    DANGER: 100 * 1024 * 1024,    // 100MB - strongly recommend optimizations
    CRITICAL: 200 * 1024 * 1024   // 200MB - likely to OOM on most systems
};

/**
 * Check file size and return recommendations
 * @param {string} filePath - Path to file
 * @returns {Object} - { size, sizeMB, level, message, recommendations }
 */
function analyzeFileSize(filePath) {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    const sizeMB = (size / (1024 * 1024)).toFixed(2);

    let level = 'ok';
    let message = '';
    let recommendations = [];

    if (size >= THRESHOLDS.CRITICAL) {
        level = 'critical';
        message = `⚠️  CRITICAL: File is ${sizeMB} MB - Very likely to run out of memory!`;
        recommendations = [
            'Use --no-grok to skip AI analysis (saves 40-60% memory)',
            'Use --no-unpack if not a webpack bundle (saves 30% memory)',
            'Process on a machine with at least 4GB available RAM',
            'Consider splitting the file if possible'
        ];
    } else if (size >= THRESHOLDS.DANGER) {
        level = 'danger';
        message = `⚠️  WARNING: File is ${sizeMB} MB - May run out of memory on systems with <8GB RAM`;
        recommendations = [
            'Use --no-grok to skip AI analysis (saves 40-60% memory)',
            'Use --no-unpack if not a webpack bundle (saves 30% memory)',
            'Close other applications to free up memory'
        ];
    } else if (size >= THRESHOLDS.WARNING) {
        level = 'warning';
        message = `ℹ️  INFO: File is ${sizeMB} MB - Processing will use significant memory (~${(size * 20 / (1024 * 1024)).toFixed(0)} MB)`;
        recommendations = [
            'Consider using --no-grok for faster processing',
            'Estimated memory usage: ~' + (size * 20 / (1024 * 1024)).toFixed(0) + ' MB'
        ];
    }

    return {
        size,
        sizeMB,
        level,
        message,
        recommendations,
        estimatedMemoryMB: Math.ceil(size * 20 / (1024 * 1024))  // 20x multiplier for AST
    };
}

/**
 * Display file size analysis to user
 * @param {Object} analysis - Result from analyzeFileSize
 * @param {boolean} quiet - Suppress output if true
 */
function displayFileSizeAnalysis(analysis, quiet = false) {
    if (quiet || analysis.level === 'ok') {
        return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(analysis.message);
    console.log('='.repeat(60));

    if (analysis.recommendations.length > 0) {
        console.log('\nRecommendations:');
        for (const rec of analysis.recommendations) {
            console.log(`  • ${rec}`);
        }
    }

    console.log('');
}

/**
 * Ask user for confirmation to proceed with large file
 * @param {Object} analysis - Result from analyzeFileSize
 * @returns {Promise<boolean>} - true if user wants to proceed
 */
async function askProceedWithLargeFile(analysis) {
    if (analysis.level === 'ok' || analysis.level === 'warning') {
        return true;  // Auto-proceed for warning level
    }

    const readline = require('readline');
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = analysis.level === 'critical'
            ? '\n⚠️  This file is very large and likely to crash. Proceed anyway? (y/N): '
            : '\nProceed with processing? (y/N): ';

        rl.question(question, (answer) => {
            rl.close();
            const proceed = answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
            resolve(proceed);
        });
    });
}

/**
 * Optimize config for large files
 * @param {Object} config - Configuration object
 * @param {Object} analysis - File size analysis
 * @returns {Object} - Modified config with optimizations
 */
function optimizeConfigForLargeFile(config, analysis) {
    const optimized = { ...config };

    if (analysis.level === 'danger' || analysis.level === 'critical') {
        // Aggressive optimizations
        optimized.dumpAST = false;  // Don't dump AST (saves huge amount of memory)
        optimized.verbose = false;  // Reduce console output overhead

        // Suggest but don't force (user might have set these explicitly)
        if (optimized.maxIterations === undefined || optimized.maxIterations > 50) {
            optimized.maxIterations = 50;  // Reduce iterations
        }
    }

    return optimized;
}

module.exports = {
    THRESHOLDS,
    analyzeFileSize,
    displayFileSizeAnalysis,
    askProceedWithLargeFile,
    optimizeConfigForLargeFile
};
