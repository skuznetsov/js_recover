/**
 * HTML Report Generator for js_recover
 * Generates interactive HTML reports with syntax highlighting
 */

const fs = require('fs');
const path = require('path');

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Generate HTML report
 * @param {Object} options - Report options
 * @param {string} options.inputFile - Input file path
 * @param {string} options.outputFile - Output file path
 * @param {string} options.originalCode - Original code (before processing)
 * @param {string} options.deobfuscatedCode - Deobfuscated code (after processing)
 * @param {Object} options.stats - Processing statistics
 * @param {Object} options.detection - Detection results
 * @param {Object} options.malwareReport - Malware analysis report (optional)
 */
function generateHTMLReport(options) {
    const {
        inputFile,
        outputFile,
        originalCode,
        deobfuscatedCode,
        stats = {},
        detection = {},
        malwareReport = null
    } = options;

    // Calculate statistics
    const originalSize = originalCode.length;
    const deobfuscatedSize = deobfuscatedCode.length;
    const compressionRatio = (originalSize / deobfuscatedSize).toFixed(2);
    const sizeChange = ((deobfuscatedSize - originalSize) / originalSize * 100).toFixed(1);
    const sizeChangeClass = sizeChange > 0 ? 'increase' : 'decrease';

    // Prepare detection info
    const detectionInfo = detection.detected ? `
        <div class="detection-info ${detection.primary.type.toLowerCase()}">
            <h3>🔍 Obfuscation Detected</h3>
            <div class="detection-grid">
                <div class="detection-item">
                    <span class="label">Type:</span>
                    <span class="value">${escapeHtml(detection.primary.type)}</span>
                </div>
                <div class="detection-item">
                    <span class="label">Confidence:</span>
                    <span class="value">${(detection.primary.confidence * 100).toFixed(1)}%</span>
                </div>
                <div class="detection-item">
                    <span class="label">Description:</span>
                    <span class="value">${escapeHtml(detection.primary.description)}</span>
                </div>
            </div>
        </div>
    ` : '';

    // Prepare malware info
    const malwareInfo = malwareReport && malwareReport.suspiciousPatterns?.length > 0 ? `
        <div class="malware-info">
            <h3>⚠️ Suspicious Patterns Detected</h3>
            <ul class="suspicious-list">
                ${malwareReport.suspiciousPatterns.map(pattern => `
                    <li>
                        <strong>${escapeHtml(pattern.pattern)}</strong>
                        <span class="severity ${pattern.severity}">${pattern.severity}</span>
                        <p>${escapeHtml(pattern.description)}</p>
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>js_recover Report - ${path.basename(inputFile)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            line-height: 1.6;
        }

        .header {
            background: #161b22;
            border-bottom: 1px solid #30363d;
            padding: 2rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }

        .header h1 {
            font-size: 2rem;
            color: #58a6ff;
            margin-bottom: 0.5rem;
        }

        .header .subtitle {
            color: #8b949e;
            font-size: 0.9rem;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 2rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 1.5rem;
        }

        .stat-card .label {
            color: #8b949e;
            font-size: 0.85rem;
            margin-bottom: 0.5rem;
            display: block;
        }

        .stat-card .value {
            color: #58a6ff;
            font-size: 1.5rem;
            font-weight: 600;
        }

        .stat-card .value.increase {
            color: #f85149;
        }

        .stat-card .value.decrease {
            color: #56d364;
        }

        .detection-info, .malware-info {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 1.5rem;
            margin-bottom: 2rem;
        }

        .detection-info h3, .malware-info h3 {
            color: #f0883e;
            margin-bottom: 1rem;
        }

        .detection-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1rem;
        }

        .detection-item {
            display: flex;
            justify-content: space-between;
        }

        .detection-item .label {
            color: #8b949e;
        }

        .detection-item .value {
            color: #c9d1d9;
            font-weight: 500;
        }

        .suspicious-list {
            list-style: none;
        }

        .suspicious-list li {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 4px;
            padding: 1rem;
            margin-bottom: 1rem;
        }

        .suspicious-list li strong {
            color: #f85149;
            display: block;
            margin-bottom: 0.5rem;
        }

        .suspicious-list .severity {
            display: inline-block;
            padding: 0.2rem 0.5rem;
            border-radius: 3px;
            font-size: 0.75rem;
            margin-left: 0.5rem;
        }

        .severity.high {
            background: #f85149;
            color: #fff;
        }

        .severity.medium {
            background: #f0883e;
            color: #fff;
        }

        .severity.low {
            background: #d29922;
            color: #fff;
        }

        .controls {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 6px;
            padding: 1rem;
            margin-bottom: 1rem;
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        .controls button {
            background: #238636;
            color: #fff;
            border: none;
            border-radius: 6px;
            padding: 0.5rem 1rem;
            cursor: pointer;
            font-size: 0.9rem;
            transition: background 0.2s;
        }

        .controls button:hover {
            background: #2ea043;
        }

        .controls button.active {
            background: #58a6ff;
        }

        .code-container {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 6px;
            overflow: hidden;
        }

        .code-header {
            background: #161b22;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #30363d;
            font-size: 0.9rem;
            color: #8b949e;
        }

        .code-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
        }

        .code-section {
            border-right: 1px solid #30363d;
        }

        .code-section:last-child {
            border-right: none;
        }

        .code-section h3 {
            background: #161b22;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #30363d;
            font-size: 0.9rem;
            color: #f0883e;
        }

        .code-section pre {
            margin: 0;
            max-height: 600px;
            overflow: auto;
        }

        .code-section pre code {
            font-size: 0.85rem;
            line-height: 1.5;
        }

        .single-view {
            display: none;
        }

        .single-view.active {
            display: block;
        }

        .comparison-view.active {
            display: grid;
        }

        @media (max-width: 1024px) {
            .code-comparison {
                grid-template-columns: 1fr;
            }

            .code-section {
                border-right: none;
                border-bottom: 1px solid #30363d;
            }

            .code-section:last-child {
                border-bottom: none;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔧 js_recover Deobfuscation Report</h1>
        <div class="subtitle">
            <strong>File:</strong> ${escapeHtml(path.basename(inputFile))} &nbsp;|&nbsp;
            <strong>Generated:</strong> ${new Date().toLocaleString()}
        </div>
    </div>

    <div class="container">
        <!-- Statistics -->
        <div class="stats-grid">
            <div class="stat-card">
                <span class="label">Original Size</span>
                <span class="value">${(originalSize / 1024).toFixed(2)} KB</span>
            </div>
            <div class="stat-card">
                <span class="label">Deobfuscated Size</span>
                <span class="value">${(deobfuscatedSize / 1024).toFixed(2)} KB</span>
            </div>
            <div class="stat-card">
                <span class="label">Size Change</span>
                <span class="value ${sizeChangeClass}">${sizeChange > 0 ? '+' : ''}${sizeChange}%</span>
            </div>
            <div class="stat-card">
                <span class="label">Iterations</span>
                <span class="value">${stats.iterations || 'N/A'}</span>
            </div>
        </div>

        ${detectionInfo}
        ${malwareInfo}

        <!-- Controls -->
        <div class="controls">
            <span style="color: #8b949e;">View:</span>
            <button onclick="showComparison()" id="btn-comparison" class="active">Side-by-Side</button>
            <button onclick="showOriginal()" id="btn-original">Original Only</button>
            <button onclick="showDeobfuscated()" id="btn-deobfuscated">Deobfuscated Only</button>
        </div>

        <!-- Code Display -->
        <div class="code-container">
            <!-- Comparison View -->
            <div class="code-comparison comparison-view active" id="comparison-view">
                <div class="code-section">
                    <h3>📥 Original Code</h3>
                    <pre><code class="language-javascript">${escapeHtml(originalCode)}</code></pre>
                </div>
                <div class="code-section">
                    <h3>📤 Deobfuscated Code</h3>
                    <pre><code class="language-javascript">${escapeHtml(deobfuscatedCode)}</code></pre>
                </div>
            </div>

            <!-- Single Views -->
            <div class="single-view" id="original-view">
                <div class="code-header">📥 Original Code</div>
                <pre><code class="language-javascript">${escapeHtml(originalCode)}</code></pre>
            </div>

            <div class="single-view" id="deobfuscated-view">
                <div class="code-header">📤 Deobfuscated Code</div>
                <pre><code class="language-javascript">${escapeHtml(deobfuscatedCode)}</code></pre>
            </div>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>
        // Initialize syntax highlighting
        hljs.highlightAll();

        function showComparison() {
            document.getElementById('comparison-view').classList.add('active');
            document.getElementById('original-view').classList.remove('active');
            document.getElementById('deobfuscated-view').classList.remove('active');

            document.getElementById('btn-comparison').classList.add('active');
            document.getElementById('btn-original').classList.remove('active');
            document.getElementById('btn-deobfuscated').classList.remove('active');
        }

        function showOriginal() {
            document.getElementById('comparison-view').classList.remove('active');
            document.getElementById('original-view').classList.add('active');
            document.getElementById('deobfuscated-view').classList.remove('active');

            document.getElementById('btn-comparison').classList.remove('active');
            document.getElementById('btn-original').classList.add('active');
            document.getElementById('btn-deobfuscated').classList.remove('active');
        }

        function showDeobfuscated() {
            document.getElementById('comparison-view').classList.remove('active');
            document.getElementById('original-view').classList.remove('active');
            document.getElementById('deobfuscated-view').classList.add('active');

            document.getElementById('btn-comparison').classList.remove('active');
            document.getElementById('btn-original').classList.remove('active');
            document.getElementById('btn-deobfuscated').classList.add('active');
        }
    </script>
</body>
</html>`;

    return html;
}

/**
 * Save HTML report to file
 */
function saveHTMLReport(options, outputPath) {
    const html = generateHTMLReport(options);
    fs.writeFileSync(outputPath, html, 'utf8');
    return outputPath;
}

module.exports = {
    generateHTMLReport,
    saveHTMLReport
};
