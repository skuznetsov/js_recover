/**
 * Test example for Grok Interface
 *
 * This example demonstrates:
 * 1. Basic text generation
 * 2. Function calling
 * 3. Structured output
 */

const { GrokInterface, createUniversalWrapper } = require('../lib/grok');

async function testBasicGeneration() {
    console.log('\n=== Test 1: Basic Generation ===');

    const grok = new GrokInterface({
        apiKey: process.env.XAI_API_KEY,
        model: 'grok-4-fast-reasoning',
        temperature: 0.3,
        useJsonMode: false
    });

    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Explain what a JavaScript AST is in 2 sentences.' }
    ];

    try {
        const response = await grok.generate(messages);
        console.log('Response:', response);

        const stats = grok.getLastUsageStats();
        console.log('\nUsage Stats:', stats);
        console.log(`Cost: $${stats.total_cost.toFixed(6)}`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function testFunctionCalling() {
    console.log('\n=== Test 2: Function Calling ===');

    const grok = new GrokInterface({
        model: 'grok-4-fast-reasoning',
        temperature: 0.1
    });

    const wrapper = createUniversalWrapper(grok);

    // Define functions
    const functions = [
        {
            name: 'extract_variable_info',
            description: 'Extract information about a variable from obfuscated JavaScript code',
            parameters: {
                type: 'object',
                properties: {
                    variable_name: {
                        type: 'string',
                        description: 'The original variable name'
                    },
                    obfuscated_name: {
                        type: 'string',
                        description: 'The obfuscated name (e.g., _0x1a2b3c)'
                    },
                    variable_type: {
                        type: 'string',
                        enum: ['string', 'number', 'boolean', 'object', 'function', 'array'],
                        description: 'The type of the variable'
                    },
                    purpose: {
                        type: 'string',
                        description: 'What the variable is used for'
                    }
                },
                required: ['variable_name', 'obfuscated_name', 'variable_type']
            }
        }
    ];

    // Example obfuscated code
    const messages = [
        { role: 'system', content: 'You are an expert at analyzing obfuscated JavaScript code.' },
        {
            role: 'user',
            content: `Analyze this obfuscated code and extract variable information:

var _0x4f2a = ['Hello', 'World'];
function _0x1b3c() {
    return _0x4f2a[0] + ' ' + _0x4f2a[1];
}

Use the extract_variable_info function to describe what each variable represents.`
        }
    ];

    try {
        const result = await wrapper.callWithFunctions(messages, functions, 'auto');

        console.log('Content:', result.content);
        console.log('\nFunction Calls:');
        for (const call of result.functionCalls) {
            console.log(`  Function: ${call.function.name}`);
            console.log(`  Arguments:`, JSON.stringify(call.function.arguments, null, 2));
        }

        const stats = wrapper.getUsageStats();
        console.log('\nUsage Stats:', stats);
        console.log(`Cost: $${stats.total_cost.toFixed(6)}`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function testStructuredOutput() {
    console.log('\n=== Test 3: Structured JSON Output ===');

    const grok = new GrokInterface({
        model: 'grok-4-fast-reasoning',
        temperature: 0.2,
        useJsonMode: true
    });

    const messages = [
        {
            role: 'user',
            content: `Analyze this obfuscated function and return a JSON object with the following structure:
{
    "function_name": "original name or purpose",
    "parameters": ["list", "of", "parameters"],
    "return_type": "what it returns",
    "complexity": "simple|medium|complex",
    "likely_purpose": "description of what it does"
}

Function to analyze:
function _0xabc123(_0x1, _0x2) {
    return _0x1 + _0x2;
}`
        }
    ];

    try {
        const response = await grok.generate(messages);
        const parsed = JSON.parse(response);

        console.log('Parsed JSON:', JSON.stringify(parsed, null, 2));

        const stats = grok.getLastUsageStats();
        console.log(`\nCost: $${stats.total_cost.toFixed(6)}`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run all tests
async function runAllTests() {
    console.log('='.repeat(60));
    console.log('Grok Interface Test Suite');
    console.log('='.repeat(60));

    if (!process.env.XAI_API_KEY) {
        console.error('\nError: XAI_API_KEY environment variable not set');
        console.error('Please set it with: export XAI_API_KEY=your_api_key');
        process.exit(1);
    }

    try {
        await testBasicGeneration();
        await testFunctionCalling();
        await testStructuredOutput();

        console.log('\n' + '='.repeat(60));
        console.log('All tests completed!');
        console.log('='.repeat(60));
    } catch (error) {
        console.error('\nTest suite failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    runAllTests();
}

module.exports = { testBasicGeneration, testFunctionCalling, testStructuredOutput };
