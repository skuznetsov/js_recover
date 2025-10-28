/**
 * CLI argument parser and help utilities for js_recover
 * Simple argument parser without external dependencies
 */

const fs = require('fs');
const path = require('path');

const VERSION = '3.2.0'; // Updated with batch processing

const HELP_TEXT = `
js_recover - JavaScript Deobfuscation and Malware Analysis Tool

USAGE:
  node app.js <input-file> [options]          Process single file
  node app.js scan <directory> [options]      Batch process directory
  node app.js --init [preset]                 Generate config file

DESCRIPTION:
  Advanced JavaScript deobfuscator with webpack/UMD bundle unpacking,
  obfuscation pattern detection, and AI-powered malware analysis.

SINGLE FILE OPTIONS:
  -h, --help              Show this help message
  -v, --version           Show version information
  -o, --output <file>     Output file path (default: <input>.out)
  --verbose               Enable verbose logging
  --quiet, -q             Suppress progress indicators
  --no-grok               Skip Grok AI analysis (faster)
  --no-unpack             Skip bundle unpacking
  --no-malware-report     Skip malware report generation
  --dump-ast              Dump AST to JSON file
  --html-report <file>    Generate interactive HTML report
  --max-iterations <n>    Maximum deobfuscation iterations (default: 100)
  --timeout <ms>          Processing timeout in milliseconds (default: 300000)

BATCH SCAN OPTIONS:
  --recursive             Scan subdirectories recursively (default: true)
  --pattern <glob>        File pattern to match (default: *.js)
  --exclude <dirs>        Comma-separated dirs to exclude (default: node_modules,.git,dist,build)
  --max-files <n>         Maximum files to process (default: 1000)
  --output-dir <dir>      Output directory for processed files
  --summary <file>        Save summary report to JSON file

CONFIGURATION:
  --preset <name>         Use predefined preset (malware-analysis, minified-code, webpack-bundle, fast)
  --init [preset]         Generate .js_recover.json config file (optionally with preset)
  --list-presets          List available presets with descriptions

EXAMPLES:
  # Basic deobfuscation
  node app.js malware.js

  # With custom output path
  node app.js bundle.js -o clean.js

  # Skip AI analysis (faster)
  node app.js large-bundle.js --no-grok

  # Verbose mode for debugging
  node app.js obfuscated.js --verbose

  # Use preset for common scenarios
  node app.js malware.js --preset malware-analysis
  node app.js bundle.js --preset webpack-bundle

  # Generate config file
  node app.js --init                    # Default config
  node app.js --init malware-analysis   # With preset

  # Scan directory for all JS files
  node app.js scan ./malware_samples/

  # Scan with pattern (only minified files)
  node app.js scan ./project/ --pattern "*.min.js"

  # Scan with summary report
  node app.js scan ./samples/ --summary report.json --no-grok

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
            init: false,
            initPreset: null,
            listPresets: false,
            preset: null,
            verbose: false,
            quiet: false,
            noGrok: false,
            noUnpack: false,
            noMalwareReport: false,
            dumpAst: false,
            inputFile: null,
            outputFile: null,
            htmlReport: null,
            maxIterations: null,
            timeout: null,
            // Batch processing options
            mode: 'single',  // 'single' or 'batch'
            scanDirectory: null,
            recursive: true,
            pattern: '*.js',
            exclude: ['node_modules', '.git', 'dist', 'build'],
            maxFiles: 1000,
            outputDir: null,
            summary: null
        };
        this.errors = [];
    }

    parse() {
        let i = 0;

        // Check if first argument is 'scan' command
        if (this.args.length > 0 && this.args[0] === 'scan') {
            this.options.mode = 'batch';
            i = 1; // Skip 'scan' keyword

            // Next argument should be directory
            if (i < this.args.length && !this.args[i].startsWith('-')) {
                this.options.scanDirectory = this.args[i];
                i++;
            }
        }

        while (i < this.args.length) {
            const arg = this.args[i];

            // Handle flags
            if (arg === '-h' || arg === '--help') {
                this.options.help = true;
                i++;
            } else if (arg === '-v' || arg === '--version') {
                this.options.version = true;
                i++;
            } else if (arg === '--init') {
                this.options.init = true;
                // Next arg might be preset name (optional)
                if (i + 1 < this.args.length && !this.args[i + 1].startsWith('-')) {
                    this.options.initPreset = this.args[i + 1];
                    i += 2;
                } else {
                    i++;
                }
            } else if (arg === '--list-presets') {
                this.options.listPresets = true;
                i++;
            } else if (arg === '--preset') {
                if (i + 1 < this.args.length) {
                    this.options.preset = this.args[i + 1];
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
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
            } else if (arg === '--html-report') {
                if (i + 1 < this.args.length) {
                    this.options.htmlReport = this.args[i + 1];
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
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
            } else if (arg === '--recursive') {
                this.options.recursive = true;
                i++;
            } else if (arg === '--pattern') {
                if (i + 1 < this.args.length) {
                    this.options.pattern = this.args[i + 1];
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--exclude') {
                if (i + 1 < this.args.length) {
                    this.options.exclude = this.args[i + 1].split(',');
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--max-files') {
                if (i + 1 < this.args.length) {
                    const value = parseInt(this.args[i + 1], 10);
                    if (isNaN(value) || value <= 0) {
                        this.errors.push(`--max-files must be a positive number`);
                    } else {
                        this.options.maxFiles = value;
                    }
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--output-dir') {
                if (i + 1 < this.args.length) {
                    this.options.outputDir = this.args[i + 1];
                    i += 2;
                } else {
                    this.errors.push(`Option ${arg} requires a value`);
                    i++;
                }
            } else if (arg === '--summary') {
                if (i + 1 < this.args.length) {
                    this.options.summary = this.args[i + 1];
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
                // Input file (positional argument) - only for single mode
                if (this.options.mode === 'single') {
                    if (this.options.inputFile === null) {
                        this.options.inputFile = arg;
                    } else {
                        this.errors.push(`Multiple input files specified: ${this.options.inputFile}, ${arg}`);
                    }
                } else {
                    this.errors.push(`Unexpected argument: ${arg}`);
                }
                i++;
            }
        }

        // Validate
        if (!this.options.help && !this.options.version) {
            if (this.options.mode === 'single' && this.options.inputFile === null) {
                this.errors.push('No input file specified');
            } else if (this.options.mode === 'batch' && this.options.scanDirectory === null) {
                this.errors.push('No directory specified for scan command');
            }
        }

        // Check if input file exists (single mode)
        if (this.options.mode === 'single' && this.options.inputFile && !this.options.help && !this.options.version) {
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

        // Check if scan directory exists (batch mode)
        if (this.options.mode === 'batch' && this.options.scanDirectory && !this.options.help && !this.options.version) {
            try {
                const realPath = fs.realpathSync(this.options.scanDirectory);
                this.options.scanDirectory = realPath;

                // Check if it's a directory
                const stats = fs.statSync(realPath);
                if (!stats.isDirectory()) {
                    this.errors.push(`Scan path is not a directory: ${this.options.scanDirectory}`);
                }
            } catch (err) {
                this.errors.push(`Cannot access directory: ${this.options.scanDirectory} (${err.message})`);
            }
        }

        // Set default output file (single mode only)
        if (this.options.mode === 'single' && this.options.inputFile && !this.options.outputFile && !this.options.help && !this.options.version) {
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

    static showPresets() {
        const { ConfigLoader } = require('./config_loader');
        const presets = ConfigLoader.listPresets();

        console.log('Available Presets:\n');
        for (const [name, description] of Object.entries(presets)) {
            console.log(`  ${name}`);
            console.log(`    ${description}\n`);
        }
    }

    static generateConfig(presetName = null) {
        const { ConfigLoader, PRESETS } = require('./config_loader');
        const configPath = './.js_recover.json';

        // Check if config already exists
        const fs = require('fs');
        if (fs.existsSync(configPath)) {
            console.error(`ERROR: Config file already exists: ${configPath}`);
            console.error('Remove it first or edit it manually.');
            return false;
        }

        // Generate config content
        let config;
        if (presetName) {
            if (!PRESETS[presetName]) {
                console.error(`ERROR: Unknown preset "${presetName}"`);
                console.error(`\nAvailable presets: ${Object.keys(PRESETS).join(', ')}`);
                return false;
            }
            config = {
                "$schema": "https://raw.githubusercontent.com/skuznetsov/js_recover/master/config-schema.json",
                "preset": presetName,
                ...PRESETS[presetName]
            };
        } else {
            config = JSON.parse(ConfigLoader.generateExample());
        }

        // Write config file
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
            console.log(`✓ Created config file: ${configPath}`);
            if (presetName) {
                console.log(`  Using preset: ${presetName}`);
            }
            return true;
        } catch (err) {
            console.error(`ERROR: Failed to write config file: ${err.message}`);
            return false;
        }
    }
}

module.exports = {
    CLIParser,
    VERSION,
    showHelp: CLIParser.showHelp,
    showVersion: CLIParser.showVersion,
    showErrors: CLIParser.showErrors,
    showPresets: CLIParser.showPresets,
    generateConfig: CLIParser.generateConfig
};
