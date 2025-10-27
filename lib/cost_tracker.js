/**
 * Cost Tracker for LLM-based Deobfuscation
 *
 * Tracks and displays real-time costs for Grok semantic analysis
 */

class CostTracker {
    constructor() {
        this.sessions = [];
        this.currentSession = null;
        this.startTime = null;
    }

    /**
     * Start a new tracking session
     */
    startSession(filename) {
        this.startTime = Date.now();
        this.currentSession = {
            filename,
            startTime: this.startTime,
            operations: [],
            totalCost: 0,
            totalTokens: 0,
            identifiersAnalyzed: 0,
            identifiersRenamed: 0
        };

        console.log('\n' + '┌' + '─'.repeat(68) + '┐');
        console.log('│' + ' LLM DEOBFUSCATION COST TRACKING'.padEnd(68) + '│');
        console.log('├' + '─'.repeat(68) + '┤');
        console.log(`│ File: ${filename.substring(0, 58).padEnd(58)} │`);
        console.log('└' + '─'.repeat(68) + '┘\n');
    }

    /**
     * Log an operation (Grok API call)
     */
    logOperation(operationType, stats) {
        if (!this.currentSession) return;

        const operation = {
            type: operationType,
            timestamp: Date.now(),
            cost: stats.total_cost || 0,
            tokens: stats.total_tokens || 0,
            inputTokens: stats.input_tokens || 0,
            outputTokens: stats.output_tokens || 0,
            identifiersAnalyzed: stats.identifiers_analyzed || 0,
            identifiersRenamed: stats.identifiers_renamed || 0
        };

        this.currentSession.operations.push(operation);
        this.currentSession.totalCost += operation.cost;
        this.currentSession.totalTokens += operation.tokens;
        this.currentSession.identifiersAnalyzed += operation.identifiersAnalyzed;
        this.currentSession.identifiersRenamed += operation.identifiersRenamed;

        // Real-time display
        this.displayOperation(operation);
    }

    /**
     * Display operation in real-time
     */
    displayOperation(op) {
        const elapsed = ((op.timestamp - this.startTime) / 1000).toFixed(1);
        const cost = `$${op.cost.toFixed(6)}`;
        const tokens = op.tokens.toLocaleString();

        console.log(`[${elapsed}s] ${op.type.padEnd(25)} │ ${tokens.padStart(8)} tokens │ ${cost.padStart(10)} │ Running: $${this.currentSession.totalCost.toFixed(6)}`);

        if (op.identifiersRenamed > 0) {
            console.log(`       ✓ Renamed ${op.identifiersRenamed} identifiers`);
        }
    }

    /**
     * End session and show summary
     */
    endSession() {
        if (!this.currentSession) return;

        const session = this.currentSession;
        const duration = ((Date.now() - session.startTime) / 1000).toFixed(1);

        console.log('\n' + '┌' + '─'.repeat(68) + '┐');
        console.log('│' + ' DEOBFUSCATION SUMMARY'.padEnd(68) + '│');
        console.log('├' + '─'.repeat(68) + '┤');
        console.log(`│ Duration:                ${duration}s`.padEnd(69) + '│');
        console.log(`│ LLM Operations:          ${session.operations.length}`.padEnd(69) + '│');
        console.log(`│ Total Tokens:            ${session.totalTokens.toLocaleString()}`.padEnd(69) + '│');
        console.log(`│ Identifiers Analyzed:    ${session.identifiersAnalyzed}`.padEnd(69) + '│');
        console.log(`│ Identifiers Renamed:     ${session.identifiersRenamed}`.padEnd(69) + '│');

        if (session.identifiersRenamed > 0) {
            const costPerIdentifier = session.totalCost / session.identifiersRenamed;
            console.log(`│ Cost per Identifier:     $${costPerIdentifier.toFixed(6)}`.padEnd(69) + '│');
        }

        console.log('├' + '─'.repeat(68) + '┤');
        console.log(`│ TOTAL LLM COST:          $${session.totalCost.toFixed(6)}`.padEnd(69) + '│');
        console.log('└' + '─'.repeat(68) + '┘\n');

        // Add to sessions history
        this.sessions.push(session);
        this.currentSession = null;
    }

    /**
     * Get total cost across all sessions
     */
    getTotalCost() {
        return this.sessions.reduce((sum, s) => sum + s.totalCost, 0) +
               (this.currentSession ? this.currentSession.totalCost : 0);
    }

    /**
     * Display cost warning if threshold exceeded
     */
    checkCostWarning(threshold = 0.10) {
        const total = this.getTotalCost();

        if (total > threshold) {
            console.log('\n' + '⚠'.repeat(35));
            console.log(`⚠️  WARNING: Total LLM costs have exceeded $${threshold.toFixed(2)}`);
            console.log(`    Current total: $${total.toFixed(6)}`);
            console.log('⚠'.repeat(35) + '\n');
        }
    }

    /**
     * Show session history
     */
    showHistory() {
        if (this.sessions.length === 0) {
            console.log('No LLM deobfuscation sessions yet.');
            return;
        }

        console.log('\n' + '┌' + '─'.repeat(68) + '┐');
        console.log('│' + ' LLM DEOBFUSCATION HISTORY'.padEnd(68) + '│');
        console.log('├' + '─'.repeat(68) + '┤');

        this.sessions.forEach((session, i) => {
            const date = new Date(session.startTime).toLocaleString();
            const filename = session.filename.substring(0, 30);
            const cost = `$${session.totalCost.toFixed(6)}`;
            const num = `${i + 1}.`.padEnd(4);

            console.log('│ ' + num + filename.padEnd(32) + ' │ ' + cost.padStart(12) + ' │');
        });

        const totalCost = this.sessions.reduce((sum, s) => sum + s.totalCost, 0);
        const totalTokens = this.sessions.reduce((sum, s) => sum + s.totalTokens, 0);

        console.log('├' + '─'.repeat(68) + '┤');
        console.log(`│ Total Sessions: ${this.sessions.length}`.padEnd(69) + '│');
        console.log(`│ Total Tokens:   ${totalTokens.toLocaleString()}`.padEnd(69) + '│');
        console.log(`│ TOTAL COST:     $${totalCost.toFixed(6)}`.padEnd(69) + '│');
        console.log('└' + '─'.repeat(68) + '┘\n');
    }

    /**
     * Export history to file
     */
    exportHistory(filepath = './llm_costs.json') {
        const fs = require('fs');

        const data = {
            sessions: this.sessions,
            totalCost: this.getTotalCost(),
            totalSessions: this.sessions.length,
            exportDate: new Date().toISOString()
        };

        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`✓ Cost history exported to ${filepath}`);
    }
}

// Global singleton instance
const globalCostTracker = new CostTracker();

module.exports = {
    CostTracker,
    tracker: globalCostTracker
};
