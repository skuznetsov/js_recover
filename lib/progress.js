/**
 * Progress and timing utilities for js_recover
 * Provides simple progress indicators and performance measurement
 */

class ProgressTimer {
    constructor(label, verbose = true) {
        this.label = label;
        this.verbose = verbose;
        this.startTime = Date.now();
        this.spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.spinnerIndex = 0;
        this.spinnerInterval = null;

        if (this.verbose) {
            process.stdout.write(`${this.label}... `);
            this.startSpinner();
        }
    }

    startSpinner() {
        // Only show spinner if stderr is a TTY (not piped/redirected)
        if (!process.stderr.isTTY) return;

        this.spinnerInterval = setInterval(() => {
            const frame = this.spinnerFrames[this.spinnerIndex];
            this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
            process.stderr.write(`\r${this.label}... ${frame} `);
        }, 80);
    }

    stopSpinner() {
        if (this.spinnerInterval) {
            clearInterval(this.spinnerInterval);
            this.spinnerInterval = null;
            if (process.stderr.isTTY) {
                process.stderr.write('\r' + ' '.repeat(this.label.length + 10) + '\r');
            }
        }
    }

    update(message) {
        if (!this.verbose) return;
        this.stopSpinner();
        process.stdout.write(`\r${this.label}... ${message} `);
        this.startSpinner();
    }

    done(result = '') {
        this.stopSpinner();
        const elapsed = Date.now() - this.startTime;
        const elapsedStr = this.formatTime(elapsed);

        if (this.verbose) {
            if (result) {
                console.log(`\r✓ ${this.label} ${result} (${elapsedStr})`);
            } else {
                console.log(`\r✓ ${this.label} (${elapsedStr})`);
            }
        }

        return elapsed;
    }

    fail(error) {
        this.stopSpinner();
        const elapsed = Date.now() - this.startTime;
        const elapsedStr = this.formatTime(elapsed);

        if (this.verbose) {
            console.log(`\r✗ ${this.label} failed (${elapsedStr})`);
            if (error) {
                console.error(`  Error: ${error}`);
            }
        }

        return elapsed;
    }

    formatTime(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(0);
            return `${minutes}m ${seconds}s`;
        }
    }
}

class ProgressTracker {
    constructor() {
        this.timings = {};
        this.verbose = true;
    }

    setVerbose(verbose) {
        this.verbose = verbose;
    }

    start(label) {
        const timer = new ProgressTimer(label, this.verbose);
        return timer;
    }

    track(label, fn) {
        const timer = this.start(label);
        try {
            const result = fn();
            if (result && typeof result.then === 'function') {
                // Handle promises
                return result.then(
                    (value) => {
                        timer.done();
                        this.timings[label] = timer.startTime;
                        return value;
                    },
                    (error) => {
                        timer.fail(error.message);
                        throw error;
                    }
                );
            } else {
                // Synchronous
                timer.done();
                this.timings[label] = timer.startTime;
                return result;
            }
        } catch (error) {
            timer.fail(error.message);
            throw error;
        }
    }

    printSummary() {
        if (!this.verbose || Object.keys(this.timings).length === 0) return;

        console.log('\n📊 Performance Summary:');
        const entries = Object.entries(this.timings);
        const maxLabelLength = Math.max(...entries.map(([label]) => label.length));

        for (const [label, time] of entries) {
            const padding = ' '.repeat(maxLabelLength - label.length);
            console.log(`  ${label}${padding}: ${this.formatTime(time)}ms`);
        }
    }

    formatTime(ms) {
        if (ms < 1000) {
            return ms.toFixed(0);
        } else if (ms < 10000) {
            return (ms / 1000).toFixed(2) + 's';
        } else {
            return (ms / 1000).toFixed(1) + 's';
        }
    }
}

// Simple progress bar for iterations
class IterationProgress {
    constructor(label, verbose = true) {
        this.label = label;
        this.verbose = verbose;
        this.iteration = 0;
        this.lastUpdate = Date.now();

        if (this.verbose) {
            console.log(`${this.label}:`);
        }
    }

    update(changes) {
        this.iteration++;
        const now = Date.now();
        const elapsed = now - this.lastUpdate;

        if (this.verbose) {
            const changeStr = changes !== undefined ? ` (${changes} changes)` : '';
            console.log(`  Iteration ${this.iteration}${changeStr} - ${elapsed}ms`);
        }

        this.lastUpdate = now;
    }

    done(totalIterations) {
        if (this.verbose && totalIterations !== undefined) {
            console.log(`  Completed in ${totalIterations} iterations`);
        }
    }
}

// Global progress tracker instance
const globalTracker = new ProgressTracker();

module.exports = {
    ProgressTimer,
    ProgressTracker,
    IterationProgress,
    tracker: globalTracker
};
