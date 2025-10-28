/**
 * Batch processing module for js_recover
 * Scan directories and process multiple JavaScript files
 */

const fs = require('fs');
const path = require('path');
const { ProgressTimer } = require('./progress');

class BatchProcessor {
    constructor(options = {}) {
        this.options = {
            recursive: options.recursive !== false,
            pattern: options.pattern || '*.js',
            exclude: options.exclude || ['node_modules', '.git', 'dist', 'build'],
            maxFiles: options.maxFiles || 1000,
            verbose: options.verbose || false,
            outputDir: options.outputDir || null
        };
        this.stats = {
            totalFiles: 0,
            processed: 0,
            failed: 0,
            bundlesUnpacked: 0,
            malwareDetected: 0,
            obfuscated: 0,
            totalSize: 0,
            errors: []
        };
    }

    /**
     * Scan directory and find all matching JavaScript files
     */
    scanDirectory(dirPath, files = []) {
        if (files.length >= this.options.maxFiles) {
            return files;
        }

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                // Check file limit
                if (files.length >= this.options.maxFiles) break;

                const fullPath = path.join(dirPath, entry.name);

                // Skip excluded directories
                if (entry.isDirectory() && this.options.exclude.includes(entry.name)) {
                    continue;
                }

                if (entry.isDirectory() && this.options.recursive) {
                    // Recursively scan subdirectories
                    this.scanDirectory(fullPath, files);
                } else if (entry.isFile() && this.matchesPattern(entry.name)) {
                    // Add matching file
                    files.push(fullPath);
                }
            }
        } catch (err) {
            if (this.options.verbose) {
                console.warn(`Warning: Cannot read directory ${dirPath}: ${err.message}`);
            }
        }

        return files;
    }

    /**
     * Check if filename matches pattern
     */
    matchesPattern(filename) {
        const pattern = this.options.pattern;

        // Simple glob pattern matching
        if (pattern === '*.js') {
            return filename.endsWith('.js');
        } else if (pattern.includes('*')) {
            // Convert glob to regex
            const regexStr = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexStr}$`);
            return regex.test(filename);
        } else {
            // Exact match
            return filename === pattern;
        }
    }

    /**
     * Process a single file
     */
    async processFile(filePath, processor) {
        try {
            // Get file stats
            const stats = fs.statSync(filePath);
            this.stats.totalSize += stats.size;

            // Process file
            const result = await processor(filePath);

            // Update statistics
            this.stats.processed++;
            if (result.bundlesUnpacked > 0) this.stats.bundlesUnpacked++;
            if (result.malwareDetected) this.stats.malwareDetected++;
            if (result.obfuscated) this.stats.obfuscated++;

            return { success: true, result };
        } catch (err) {
            this.stats.failed++;
            this.stats.errors.push({ file: filePath, error: err.message });
            return { success: false, error: err.message };
        }
    }

    /**
     * Process all files in batch
     */
    async processBatch(files, processor, options = {}) {
        const quiet = options.quiet || false;
        const timer = new ProgressTimer(`Processing ${files.length} files`, !quiet);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            if (!quiet) {
                timer.update(`${i + 1}/${files.length}: ${path.basename(file)}`);
            }

            await this.processFile(file, processor);
        }

        timer.done(`${this.stats.processed} succeeded, ${this.stats.failed} failed`);

        return this.stats;
    }

    /**
     * Generate summary report
     */
    generateSummaryReport() {
        const sizeMB = (this.stats.totalSize / (1024 * 1024)).toFixed(2);

        let report = '\n';
        report += '═══════════════════════════════════════════════\n';
        report += '       BATCH PROCESSING SUMMARY\n';
        report += '═══════════════════════════════════════════════\n\n';

        report += `📁 Files Found:          ${this.stats.totalFiles}\n`;
        report += `✓  Processed:            ${this.stats.processed}\n`;
        report += `✗  Failed:               ${this.stats.failed}\n`;
        report += `📦 Bundles Unpacked:     ${this.stats.bundlesUnpacked}\n`;
        report += `🔍 Obfuscated:           ${this.stats.obfuscated}\n`;
        report += `⚠️  Malware Detected:     ${this.stats.malwareDetected}\n`;
        report += `💾 Total Size:           ${sizeMB} MB\n`;

        if (this.stats.failed > 0 && this.stats.errors.length > 0) {
            report += '\n❌ ERRORS:\n';
            for (const err of this.stats.errors.slice(0, 10)) {
                report += `  • ${path.basename(err.file)}: ${err.error}\n`;
            }
            if (this.stats.errors.length > 10) {
                report += `  ... and ${this.stats.errors.length - 10} more\n`;
            }
        }

        report += '\n═══════════════════════════════════════════════\n';

        return report;
    }

    /**
     * Export summary to JSON
     */
    exportSummaryJSON(outputPath) {
        const summary = {
            timestamp: new Date().toISOString(),
            options: this.options,
            stats: this.stats,
            files: this.stats.errors.map(e => ({
                file: e.file,
                error: e.error
            }))
        };

        fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
        return outputPath;
    }

    /**
     * Main entry point for batch scanning
     */
    async scan(inputPath, processor, options = {}) {
        const scanTimer = new ProgressTimer('Scanning files', !options.quiet);

        // Check if input is directory or file
        const stats = fs.statSync(inputPath);

        let files = [];
        if (stats.isDirectory()) {
            files = this.scanDirectory(inputPath);
        } else if (stats.isFile()) {
            files = [inputPath];
        } else {
            throw new Error(`Invalid input path: ${inputPath}`);
        }

        this.stats.totalFiles = files.length;
        scanTimer.done(`found ${files.length} files`);

        if (files.length === 0) {
            console.warn('⚠️  No files found matching pattern');
            return this.stats;
        }

        if (files.length > this.options.maxFiles) {
            console.warn(`⚠️  Found ${files.length} files, limiting to ${this.options.maxFiles}`);
            files = files.slice(0, this.options.maxFiles);
            this.stats.totalFiles = files.length;
        }

        // Process all files
        await this.processBatch(files, processor, options);

        return this.stats;
    }
}

module.exports = BatchProcessor;
