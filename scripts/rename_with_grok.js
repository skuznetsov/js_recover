#!/usr/bin/env node

/**
 * Grok-based Semantic Module Renaming
 *
 * Analyzes unpacked webpack modules using Grok AI and suggests better names
 * based on semantic understanding of the code.
 *
 * Usage:
 *   node scripts/rename_with_grok.js <unpacked_folder>
 *   node scripts/rename_with_grok.js data/bundle.js.unpacked
 *
 * Options:
 *   --dry-run    Show suggested renames without applying
 *   --force      Rename even low-confidence suggestions
 */

const fs = require('fs');
const path = require('path');
const GrokInterface = require('../lib/grok/interface');

const args = process.argv.slice(2);
const unpackedFolder = args.find(a => !a.startsWith('--'));
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

if (!unpackedFolder) {
    console.error('Usage: node scripts/rename_with_grok.js <unpacked_folder> [--dry-run] [--force]');
    process.exit(1);
}

if (!fs.existsSync(unpackedFolder)) {
    console.error(`Error: Folder not found: ${unpackedFolder}`);
    process.exit(1);
}

const mappingPath = path.join(unpackedFolder, 'mapping.json');
if (!fs.existsSync(mappingPath)) {
    console.error(`Error: mapping.json not found in ${unpackedFolder}`);
    console.error('Make sure this folder was created by the bundle unpacker.');
    process.exit(1);
}

if (!process.env.XAI_API_KEY) {
    console.error('Error: XAI_API_KEY environment variable not set');
    console.error('Please set your xAI API key: export XAI_API_KEY=your_key_here');
    process.exit(1);
}

async function analyzeModuleWithGrok(grok, moduleCode, currentName, moduleId) {
    const prompt = `You are analyzing a webpack module extracted from a JavaScript bundle. Your task is to suggest a concise, meaningful filename based on the code's purpose.

Current filename: ${currentName}.js
Module ID: ${moduleId}

Code:
\`\`\`javascript
${moduleCode.substring(0, 3000)} // Truncated if too long
\`\`\`

Analyze this code and suggest:
1. A short, descriptive filename (without .js extension)
2. Confidence level (high/medium/low)
3. Brief reason for the name

Rules:
- Use lowercase with underscores (e.g., "user_auth", "api_client")
- Keep it under 30 characters
- If the code looks suspicious/malicious, prefix with "SUSPICIOUS_"
- Be specific (prefer "user_auth" over "auth", "payment_processor" over "payments")

Respond in JSON format:
{
  "filename": "suggested_name",
  "confidence": "high|medium|low",
  "reason": "brief explanation",
  "malware": true|false
}`;

    try {
        // GrokInterface.generate() returns just the content string, not full response
        const content = await grok.generate([
            { role: 'user', content: prompt }
        ]);

        if (!content) {
            console.error(`  [${moduleId}] Empty Grok response`);
            return null;
        }

        // Get usage stats from the interface
        const usage = grok.lastUsageStats || { total_tokens: 0, input_tokens: 0, output_tokens: 0 };

        // Try to parse JSON from response
        let analysis;
        try {
            analysis = JSON.parse(content);
        } catch (e) {
            // If not direct JSON, try to extract it
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error(`  [${moduleId}] Grok response not JSON, got: ${content.substring(0, 100)}`);
                return null;
            }
            analysis = JSON.parse(jsonMatch[0]);
        }

        // Validate response
        if (!analysis.filename || !analysis.confidence) {
            console.error(`  [${moduleId}] Invalid Grok response format, missing fields`);
            return null;
        }

        return {
            filename: analysis.filename.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            confidence: analysis.confidence,
            reason: analysis.reason || 'Grok analysis',
            malware: analysis.malware || false,
            tokens: usage.total_tokens,
            cost: calculateCost(usage)
        };
    } catch (error) {
        console.error(`  [${moduleId}] Error analyzing with Grok:`, error.message);
        return null;
    }
}

function calculateCost(usage) {
    // Grok-4-fast-reasoning pricing ($0.20 per 1M input, $0.50 per 1M output)
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;

    const inputCost = (inputTokens / 1_000_000) * 0.20;
    const outputCost = (outputTokens / 1_000_000) * 0.50;

    return inputCost + outputCost;
}

async function main() {
    console.log('🤖 Grok Semantic Module Renamer');
    console.log('================================\n');

    // Load mapping
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    console.log(`📦 Bundle: ${mapping.originalFile}`);
    console.log(`📁 Modules: ${mapping.extractedModules}/${mapping.totalModules}`);

    if (mapping.suspiciousCount > 0) {
        console.log(`⚠️  Suspicious: ${mapping.suspiciousCount} modules`);
    }

    console.log('');

    if (isDryRun) {
        console.log('🔍 DRY RUN MODE - No files will be renamed\n');
    }

    // Initialize Grok
    const grok = new GrokInterface({
        apiKey: process.env.XAI_API_KEY,
        model: 'grok-4-fast-reasoning'
    });

    let totalCost = 0;
    let totalTokens = 0;
    let renamedCount = 0;
    const usedNames = new Set();

    // Process each module
    for (const module of mapping.modules) {
        const currentPath = path.join(unpackedFolder, module.filename);

        if (!fs.existsSync(currentPath)) {
            console.error(`  [${module.id}] File not found: ${module.filename}`);
            continue;
        }

        console.log(`\n[${module.id}] ${module.filename}`);
        console.log(`  Pattern: ${module.patternName} (${module.confidence})`);
        console.log(`  Reason: ${module.reason}`);

        // Read module code
        const moduleCode = fs.readFileSync(currentPath, 'utf8');

        // Analyze with Grok
        console.log(`  🤖 Analyzing with Grok...`);
        const grokAnalysis = await analyzeModuleWithGrok(
            grok,
            moduleCode,
            module.patternName,
            module.id
        );

        if (!grokAnalysis) {
            console.log(`  ❌ Skipping (analysis failed)`);
            continue;
        }

        totalCost += grokAnalysis.cost;
        totalTokens += grokAnalysis.tokens;

        console.log(`  💡 Grok suggests: ${grokAnalysis.filename}.js (${grokAnalysis.confidence})`);
        console.log(`  📝 Reason: ${grokAnalysis.reason}`);
        console.log(`  💰 Cost: $${grokAnalysis.cost.toFixed(6)} (${grokAnalysis.tokens} tokens)`);

        // Decide whether to rename
        let shouldRename = false;
        let newName = grokAnalysis.filename;

        if (grokAnalysis.confidence === 'high' || (grokAnalysis.confidence === 'medium' && isForce)) {
            shouldRename = true;
        } else if (grokAnalysis.confidence === 'low' && isForce) {
            shouldRename = true;
            console.log(`  ⚠️  Low confidence, but --force enabled`);
        } else {
            console.log(`  ⏭️  Skipping (confidence too low, use --force to override)`);
            continue;
        }

        // Handle name conflicts
        let finalName = newName;
        let suffix = 0;
        while (usedNames.has(finalName)) {
            suffix++;
            finalName = `${newName}_${suffix}`;
        }
        usedNames.add(finalName);

        const newPath = path.join(unpackedFolder, `${finalName}.js`);

        if (shouldRename && !isDryRun) {
            // Rename file
            fs.renameSync(currentPath, newPath);

            // Update mapping
            module.grokName = finalName;
            module.grokReason = grokAnalysis.reason;
            module.grokConfidence = grokAnalysis.confidence;
            module.filename = `${finalName}.js`;

            console.log(`  ✅ Renamed: ${module.patternName}.js → ${finalName}.js`);
            renamedCount++;
        } else if (shouldRename) {
            console.log(`  🔍 Would rename: ${module.patternName}.js → ${finalName}.js`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Save updated mapping
    if (!isDryRun && renamedCount > 0) {
        mapping.grokRenamedAt = new Date().toISOString();
        mapping.grokRenamedCount = renamedCount;
        fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
    }

    // Summary
    console.log('\n================================');
    console.log('📊 Summary');
    console.log('================================');
    console.log(`Analyzed: ${mapping.modules.length} modules`);
    console.log(`Renamed: ${renamedCount} modules`);
    console.log(`Total tokens: ${totalTokens.toLocaleString()}`);
    console.log(`Total cost: $${totalCost.toFixed(6)}`);

    if (isDryRun) {
        console.log('\n💡 Run without --dry-run to apply changes');
    }

    console.log('\n✅ Done!');
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
