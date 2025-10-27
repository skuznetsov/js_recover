# Grok 4 Fast Reasoning Integration

## Overview

This document describes the integration of xAI's Grok-4 Fast Reasoning model into the js_recover deobfuscation pipeline.

Grok-4 is used for **semantic analysis** of obfuscated JavaScript code, providing intelligent insights that go beyond pattern matching.

## Architecture

The Grok integration is based on a port of the Python `agents_assembly` library:

```
lib/grok/
├── interface.js           # Main GrokInterface class (port of llm_interfaces/grok.py)
├── universal_wrapper.js   # Universal function calling wrapper
└── index.js               # Exports
```

## Installation

1. **Install dependencies:**
```bash
npm install axios
```

2. **Set API key:**
```bash
export XAI_API_KEY=your_api_key_here
```

Get your API key from: https://console.x.ai/

## Usage

### Basic Generation

```javascript
const { GrokInterface } = require('./lib/grok');

const grok = new GrokInterface({
    model: 'grok-4-fast-reasoning',
    temperature: 0.3,
    useJsonMode: false
});

const messages = [
    { role: 'system', content: 'You are a JavaScript expert.' },
    { role: 'user', content: 'Explain what this code does: var x = 0x1a;' }
];

const response = await grok.generate(messages);
console.log(response);

// Get usage statistics
const stats = grok.getLastUsageStats();
console.log(`Cost: $${stats.total_cost.toFixed(6)}`);
```

### Function Calling (Structured Extraction)

Function calling allows Grok to return structured data in a reliable format.

```javascript
const { GrokInterface, createUniversalWrapper } = require('./lib/grok');

const grok = new GrokInterface({ model: 'grok-4-fast-reasoning' });
const wrapper = createUniversalWrapper(grok);

// Define extraction schema
const functions = [
    {
        name: 'extract_variable_info',
        description: 'Extract information about a variable',
        parameters: {
            type: 'object',
            properties: {
                variable_name: {
                    type: 'string',
                    description: 'The original variable name'
                },
                variable_type: {
                    type: 'string',
                    enum: ['string', 'number', 'function', 'object'],
                    description: 'Variable type'
                },
                purpose: {
                    type: 'string',
                    description: 'What the variable is used for'
                }
            },
            required: ['variable_name', 'variable_type']
        }
    }
];

const messages = [
    { role: 'user', content: 'Analyze: var _0x4f2a = ["Hello", "World"];' }
];

const result = await wrapper.callWithFunctions(messages, functions);

// result.functionCalls contains structured data:
// [
//   {
//     function: {
//       name: 'extract_variable_info',
//       arguments: {
//         variable_name: 'greetingArray',
//         variable_type: 'array',
//         purpose: 'Stores greeting words'
//       }
//     }
//   }
// ]
```

### JSON Mode (Structured Output)

For cases where you don't need strict function calling but want JSON output:

```javascript
const grok = new GrokInterface({
    model: 'grok-4-fast-reasoning',
    useJsonMode: true
});

const messages = [
    {
        role: 'user',
        content: `Return JSON: { "functionName": "...", "purpose": "..." }

        Analyze: function _0xabc() { return "test"; }`
    }
];

const response = await grok.generate(messages);
const parsed = JSON.parse(response);
```

## Pricing

Model: **grok-4-fast-reasoning**
- Input: $0.20 per 1M tokens
- Output: $0.50 per 1M tokens

Example costs:
- Analyze 100 obfuscated functions (~50K tokens): ~$0.01
- Full codebase analysis (500K tokens): ~$0.10

The library automatically tracks costs via `getLastUsageStats()`.

## Integration with js_recover

### Semantic Variable Naming

Create a new mutator that uses Grok to suggest better variable names:

```javascript
// lib/mutators/semantic_rename_variables.js
const { GrokInterface, createUniversalWrapper } = require('../grok');

async function semanticRenameVariables(node, opts, parentStack) {
    if (!process.env.XAI_API_KEY) {
        return false; // Skip if no API key
    }

    if (node.type === 'VariableDeclarator' && node.id.name.startsWith('_0x')) {
        const grok = new GrokInterface({ temperature: 0.1 });
        const wrapper = createUniversalWrapper(grok);

        // Extract context around variable
        const codeContext = extractCodeContext(node, parentStack);

        const functions = [{
            name: 'suggest_variable_name',
            description: 'Suggest a descriptive variable name based on usage',
            parameters: {
                type: 'object',
                properties: {
                    suggested_name: { type: 'string' },
                    confidence: { type: 'number', minimum: 0, maximum: 1 },
                    reasoning: { type: 'string' }
                },
                required: ['suggested_name', 'confidence']
            }
        }];

        const result = await wrapper.callWithFunctions([
            { role: 'user', content: `Suggest variable name:\n${codeContext}` }
        ], functions);

        if (result.functionCalls.length > 0) {
            const suggestion = result.functionCalls[0].function.arguments;
            if (suggestion.confidence > 0.7) {
                node.id.name = suggestion.suggested_name;
                return true;
            }
        }
    }

    return false;
}
```

### Complexity Analysis

Use Grok to analyze code complexity and identify obfuscation techniques:

```javascript
const { GrokInterface } = require('../grok');

async function analyzeComplexity(ast) {
    const grok = new GrokInterface({ useJsonMode: true });

    const codeSnippet = generateCodeFromAST(ast);

    const response = await grok.generate([{
        role: 'user',
        content: `Analyze this code and return JSON:
{
    "complexity": "low|medium|high",
    "obfuscation_techniques": ["technique1", "technique2"],
    "confidence": 0.0-1.0,
    "suggested_approach": "deobfuscation strategy"
}

Code:
${codeSnippet}`
    }]);

    return JSON.parse(response);
}
```

## Performance Considerations

1. **Caching**: Cache Grok responses to avoid repeated API calls for the same code patterns
2. **Batching**: Analyze multiple functions in one request using function calling
3. **Selective analysis**: Only use Grok for complex cases where pattern matching fails
4. **Fallback**: Always have non-Grok fallback for when API is unavailable

Example caching strategy:

```javascript
const crypto = require('crypto');
const responseCache = new Map();

async function cachedGrokAnalysis(code, grok) {
    const hash = crypto.createHash('sha256').update(code).digest('hex');

    if (responseCache.has(hash)) {
        return responseCache.get(hash);
    }

    const result = await grok.generate([...]);
    responseCache.set(hash, result);

    return result;
}
```

## Testing

Run the test suite:

```bash
export XAI_API_KEY=your_key
node examples/test_grok.js
```

Tests cover:
1. Basic text generation
2. Function calling with structured extraction
3. JSON mode for structured output

## Limitations

1. **API Rate Limits**: X.AI may have rate limits (not documented yet)
2. **Cost**: Semantic analysis adds cost (~$0.0001-0.001 per function)
3. **Latency**: Network requests add 100-500ms per call
4. **Non-deterministic**: AI responses may vary, use low temperature (0.1-0.3) for consistency

## Best Practices

1. **Use low temperature** (0.1-0.3) for renaming/classification tasks
2. **Use function calling** for structured extraction (more reliable than JSON mode)
3. **Validate responses** - always check that returned data matches expected schema
4. **Handle errors gracefully** - network/API failures should not break the pipeline
5. **Monitor costs** - track token usage via `getLastUsageStats()`

## Future Enhancements

1. **Streaming support** - for real-time feedback on large codebases
2. **Multi-model ensemble** - combine Grok with Claude/GPT for consensus
3. **Fine-tuning** - train on deobfuscation-specific datasets
4. **Context window optimization** - intelligently select relevant code context

## References

- Original Python library: `/Users/sergey/Projects/ML/agents_assembly/`
- X.AI API docs: https://docs.x.ai/
- Grok pricing: https://x.ai/pricing
