/**
 * Configuration file loader for js_recover
 * Loads .js_recover.json from project directory or home directory
 * Supports presets and CLI override
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Default configuration
const DEFAULT_CONFIG = {
    // Processing options
    verbose: false,
    quiet: false,
    noGrok: false,
    noUnpack: false,
    noMalwareReport: false,
    dumpAst: false,
    maxIterations: 100,
    timeout: 300000, // 5 minutes

    // Batch processing options
    batch: {
        recursive: true,
        pattern: '*.js',
        exclude: ['node_modules', '.git', 'dist', 'build'],
        maxFiles: 1000
    }
};

// Predefined presets for common use cases
const PRESETS = {
    'malware-analysis': {
        verbose: true,
        noGrok: false,
        noUnpack: false,
        noMalwareReport: false,
        maxIterations: 150,
        timeout: 600000, // 10 minutes
        batch: {
            pattern: '*.js',
            exclude: ['node_modules', '.git']
        }
    },
    'minified-code': {
        verbose: false,
        noGrok: true, // Skip expensive AI analysis for minified code
        noUnpack: false,
        maxIterations: 50,
        timeout: 60000, // 1 minute
        batch: {
            pattern: '*.min.js',
            exclude: ['node_modules', '.git', 'dist', 'build']
        }
    },
    'webpack-bundle': {
        verbose: true,
        noGrok: true,
        noUnpack: false,
        noMalwareReport: true, // Focus on unpacking, not analysis
        maxIterations: 20,
        timeout: 120000, // 2 minutes
        batch: {
            pattern: '*.bundle.js',
            exclude: ['node_modules', '.git']
        }
    },
    'fast': {
        verbose: false,
        quiet: true,
        noGrok: true,
        noUnpack: true,
        noMalwareReport: true,
        maxIterations: 10,
        timeout: 30000, // 30 seconds
        batch: {
            pattern: '*.js',
            exclude: ['node_modules', '.git', 'dist', 'build', 'test', 'tests']
        }
    }
};

class ConfigLoader {
    constructor() {
        this.projectConfigPath = null;
        this.homeConfigPath = null;
        this.loadedConfig = null;
    }

    /**
     * Search for .js_recover.json in current directory and parent directories
     */
    findProjectConfig(startDir = process.cwd()) {
        let currentDir = startDir;
        const root = path.parse(currentDir).root;

        while (currentDir !== root) {
            const configPath = path.join(currentDir, '.js_recover.json');
            if (fs.existsSync(configPath)) {
                return configPath;
            }
            currentDir = path.dirname(currentDir);
        }

        return null;
    }

    /**
     * Get home directory config path
     */
    getHomeConfigPath() {
        return path.join(os.homedir(), '.js_recover.json');
    }

    /**
     * Load and parse JSON config file
     */
    loadConfigFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const config = JSON.parse(content);
            return config;
        } catch (err) {
            console.warn(`Warning: Failed to load config from ${filePath}: ${err.message}`);
            return null;
        }
    }

    /**
     * Apply preset if specified in config
     */
    applyPreset(config) {
        if (!config.preset) {
            return config;
        }

        const presetName = config.preset;
        if (!PRESETS[presetName]) {
            console.warn(`Warning: Unknown preset "${presetName}". Available presets: ${Object.keys(PRESETS).join(', ')}`);
            return config;
        }

        console.log(`Using preset: ${presetName}`);
        const preset = PRESETS[presetName];

        // Merge preset with config (config overrides preset)
        return this.deepMerge(preset, config);
    }

    /**
     * Deep merge two objects (second overrides first)
     */
    deepMerge(target, source) {
        const result = { ...target };

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.deepMerge(target[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
        }

        return result;
    }

    /**
     * Load configuration with priority:
     * CLI flags > project config > home config > defaults
     */
    load(options = {}) {
        // Start with defaults
        let config = { ...DEFAULT_CONFIG };

        // Load home config (~/.js_recover.json)
        this.homeConfigPath = this.getHomeConfigPath();
        if (fs.existsSync(this.homeConfigPath)) {
            const homeConfig = this.loadConfigFile(this.homeConfigPath);
            if (homeConfig) {
                config = this.deepMerge(config, homeConfig);
                if (options.verbose) {
                    console.log(`Loaded home config: ${this.homeConfigPath}`);
                }
            }
        }

        // Load project config (.js_recover.json in current or parent directories)
        this.projectConfigPath = this.findProjectConfig();
        if (this.projectConfigPath) {
            const projectConfig = this.loadConfigFile(this.projectConfigPath);
            if (projectConfig) {
                // Apply preset if specified
                const configWithPreset = this.applyPreset(projectConfig);
                config = this.deepMerge(config, configWithPreset);
                if (options.verbose) {
                    console.log(`Loaded project config: ${this.projectConfigPath}`);
                }
            }
        }

        // CLI options override everything (already handled in app.js)
        this.loadedConfig = config;
        return config;
    }

    /**
     * Get list of available presets with descriptions
     */
    static listPresets() {
        return {
            'malware-analysis': 'Full analysis with AI and malware detection (slow, thorough)',
            'minified-code': 'Fast processing for minified code without AI (fast, basic)',
            'webpack-bundle': 'Focused on bundle unpacking without analysis (medium, extraction)',
            'fast': 'Quick processing with minimal features (fastest, basic deobfuscation)'
        };
    }

    /**
     * Generate example config file
     */
    static generateExample() {
        const example = {
            "$schema": "https://raw.githubusercontent.com/skuznetsov/js_recover/master/config-schema.json",
            "preset": "malware-analysis",
            "verbose": false,
            "noGrok": false,
            "maxIterations": 100,
            "timeout": 300000,
            "batch": {
                "recursive": true,
                "pattern": "*.js",
                "exclude": ["node_modules", ".git", "dist", "build"],
                "maxFiles": 1000
            }
        };

        return JSON.stringify(example, null, 2);
    }
}

module.exports = { ConfigLoader, PRESETS, DEFAULT_CONFIG };
