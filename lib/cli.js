/**
 * CLI argument parser and help utilities for js_recover
 * Simple argument parser without external dependencies
 */

const fs = require('fs');
const path = require('path');

const VERSION = '3.1.0'; // Updated with recent features

const HELP_TEXT = `
js_recover - JavaScript Deobfuscation and Malware Analysis Tool

USAGE:
  node app.js <input-file> [options]

DESCRIPTION:
  Advanced JavaScript deobfuscator with webpack/UMD bundle unpacking,
  obfuscation pattern detection, and AI-powered malware analysis.

OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version information
  -o, --output <file>     Output file path (default: <input>.out)
  --verbose               Enable verbose logging
  --quiet, -q             Suppress progress indicators
  --no-grok               Skip Grok AI analysis (faster)
  --no-unpack             Skip bundle unpacking
  --no-malware-report     Skip malware report generation
  --dump-ast              Dump AST to JSON file
  --max-iterations <n>    Maximum deobfuscation iterations (default: 100)
  --timeout <ms>          Processing timeout in milliseconds (default: 300000)

EXAMPLES:
  # Basic deobfuscation
  node app.js malware.js

  # With custom output path
  node app.js bundle.js -o clean.js

  # Skip AI analysis (faster)
  node app.js large-bundle.js --no-grok

  # Verbose mode for debugging
  node app.js obfuscated.js --verbose

FEATURES:
  • Webpack 4/5 bundle unpacking with source maps
  • UMD wrapper detection and unwrapping
  • Obfuscator.io pattern detection
  • Control flow simplification
  • String deobfuscation (hex, unicode, base64)
  • Dead code elimination
  • AI-powered semantic analysis (Grok)
  • Malware behavior detection

ENVIRONMENT VARIABLES:
  XAI_API_KEY            X.AI API key for Grok analysis
  NODE_CONFIG_DIR        Config directory path

MORE INFO:
  Repository: https://github.com/skuznetsov/js_recover
  Issues: https://github.com/skuznetsov/js_recover/issues
`;

class CLIParser {
    constructor(args = process.argv.slice(2)) {
        this.args = args;
        this.options = {
            help: false,
            version: false,
            verbose: false,
            quiet: false,
            noGrok: false,
            noUnpack: false,
            noMalwareReport: false,
            dumpAst: false,
            inputFile: null,
            outputFile: null,
            maxIterations: null,
            timeout: null
        };
        this.errors = [];
    }

    parse() {
        let i = 0;
        while (i < this.args.length) {
            const arg = this.args[i];

            // Handle flags
            if (arg === '-h' || arg === '--help') {
                this.options.help = true;
                i++;
            } else if (arg === '-v' || arg === '--version') {
                this.options.version = true;
                i++;
            } else if (arg === '--verbose') {
                this.options.verbose = true;
                i++;
            } else if (arg === '-q' || arg === '--quiet') {
                this.options.quiet = true;
                i++;
            } else if (arg === '--no-grok') {
                this.options.noGrok = true;
                i++;
            } else if (arg === '--no-unpack') {
                this.options.noUnpack = true;
                i++;
            } else if (arg === '--no-malware-report') {
                this.options.noMalwareReport = true;
                i++;
            } else if (arg === '--dump-ast') {
                this.options.dumpAst = true;
                i++;
            } else if (arg === '-o' || arg === '--output') {
                // Next arg is output file
                if (i + 1 < this.args.length) {
                    this.options.outputFile = this.args[i + 1];
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--max-iterations') {
                if (i + 1 < this.args.length) {
                    const value = parseInt(this.args[i + 1], 10);
                    if (isNaN(value) || value <= 0) {
                        this.errors.push(`--max-iterations must be a positive number`);
                    } else {
                        this.options.maxIterations = value;
                    }
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--timeout') {
                if (i + 1 < this.args.length) {
                    const value = parseInt(this.args[i + 1], 10);
                    if (isNaN(value) || value <= 0) {
                        this.errors.push(`--timeout must be a positive number`);
                    } else {
                        this.options.timeout = value;
                    }
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg.startsWith('-')) {
                // Unknown option
                this.errors.push(`Unknown option: ${arg}`);
                i++;
            } else {
                // Input file (positional argument)
                if (this.options.inputFile === null) {
                    this.options.inputFile = arg;
                } else {
                    this.errors.push(`Multiple input files specified: ${this.options.inputFile}, ${arg}`);
                }
                i++;
            }
        }

        // Validate
        if (!this.options.help && !this.options.version && this.options.inputFile === null) {
            this.errors.push('No input file specified');
        }

        // Check if input file exists
        if (this.options.inputFile && !this.options.help && !this.options.version) {
            try {
                const realPath = fs.realpathSync(this.options.inputFile);
                this.options.inputFile = realPath;

                // Check if it's a file
                const stats = fs.statSync(realPath);
                if (!stats.isFile()) {
                    this.errors.push(`Input path is not a file: ${this.options.inputFile}`);
                }
            } catch (err) {
                this.errors.push(`Cannot access input file: ${this.options.inputFile} (${err.message})`);
            }
        }

        // Set default output file
        if (this.options.inputFile && !this.options.outputFile && !this.options.help && !this.options.version) {
            this.options.outputFile = `${this.options.inputFile}.out`;
        }

        return {
            options: this.options,
            errors: this.errors,
            isValid: this.errors.length === 0
        };
    }

    static showHelp() {
        console.log(HELP_TEXT);
    }

    static showVersion() {
        console.log(`js_recover version ${VERSION}`);
        console.log('');
        console.log('Features:');
        console.log('  • Webpack 4/5 bundle unpacking');
        console.log('  • UMD wrapper detection');
        console.log('  • Obfuscator.io pattern detection');
        console.log('  • Source map generation');
        console.log('  • AI-powered malware analysis (Grok)');
        console.log('  • Performance monitoring');
    }

    static showErrors(errors) {
        console.error('ERROR: Invalid arguments\n');
        for (const error of errors) {
            console.error(`  ✗ ${error}`);
        }
        console.error('\nUse --help for usage information');
    }
}

module.exports = {
    CLIParser,
    VERSION,
    showHelp: CLIParser.showHelp,
    showVersion: CLIParser.showVersion,
    showErrors: CLIParser.showErrors
};
