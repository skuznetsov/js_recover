/**
 * UniversalFunctionCallingWrapper
 * =================================
 *
 * Port of Python agents_assembly/core/universal_function_calling.py
 * Unified interface for function calling across all LLM providers
 * Handles provider-specific format differences and provides standardized API
 */

/**
 * Standardized function call result across all providers
 */
class FunctionCallResult {
    constructor(content, functionCalls, usage, provider, rawResponse = null) {
        this.content = content;
        this.functionCalls = functionCalls;
        this.usage = usage;
        this.provider = provider;
        this.rawResponse = rawResponse;
    }
}

/**
 * Universal wrapper for function calling across LLM providers
 *
 * Handles format conversions and provides unified API for:
 * - Grok (xAI)
 * - OpenAI
 * - Claude (Anthropic)
 * - Gemini (Google)
 */
class UniversalFunctionCallingWrapper {
    /**
     * Initialize wrapper with an LLM interface
     *
     * @param {Object} llmInterface - Any LLM interface (GrokInterface, OpenAI, Claude, Gemini)
     */
    constructor(llmInterface) {
        this.llm = llmInterface;
        this.provider = this._detectProvider();
        console.log(`UniversalFunctionCallingWrapper initialized for provider: ${this.provider}`);
    }

    /**
     * Detect which provider this interface is for
     *
     * @returns {string} Provider name
     * @private
     */
    _detectProvider() {
        const className = this.llm.constructor.name;

        if (className.includes('Grok')) {
            return 'grok';
        } else if (className.includes('OpenAI')) {
            return 'openai';
        } else if (className.includes('Claude')) {
            return 'claude';
        } else if (className.includes('Gemini')) {
            return 'gemini';
        } else {
            console.warn(`Unknown provider: ${className}, defaulting to 'unknown'`);
            return 'unknown';
        }
    }

    /**
     * Universal function calling interface
     *
     * @param {Array<Object>} messages - Conversation history in standard format
     * @param {Array<Object>} functions - Function definitions (will be converted to provider format)
     * @param {string} [toolChoice='auto'] - "auto", "none", "required", or specific function name
     * @returns {Promise<FunctionCallResult>} Standardized response
     */
    async callWithFunctions(messages, functions, toolChoice = 'auto') {
        // Convert function definitions to provider-specific format
        const providerFunctions = this._convertFunctionsToProviderFormat(functions);

        // Call provider-specific method
        let result;
        if (this.provider === 'grok' || this.provider === 'openai') {
            // Both use OpenAI tools format
            result = await this.llm.generateWithTools(messages, providerFunctions, toolChoice);
        } else if (this.provider === 'claude') {
            // Claude has its own tools format
            result = await this.llm.generateWithTools(messages, providerFunctions);
        } else if (this.provider === 'gemini') {
            // Gemini has native generate_with_tools support
            result = await this.llm.generateWithTools(messages, providerFunctions);
        } else {
            throw new Error(`Unsupported provider: ${this.provider}`);
        }

        // Get usage stats
        let usage = {};
        if (typeof this.llm.getLastUsageStats === 'function') {
            usage = this.llm.getLastUsageStats();
        }

        // Normalize response
        return this._normalizeResponse(result, usage);
    }

    /**
     * Convert function definitions to provider-specific format
     *
     * Input format (universal):
     * {
     *     "name": "function_name",
     *     "description": "What it does",
     *     "parameters": {
     *         "type": "object",
     *         "properties": {...},
     *         "required": [...]
     *     }
     * }
     *
     * @param {Array<Object>} functions - Universal function definitions
     * @returns {Array<Object>} Provider-specific function definitions
     * @private
     */
    _convertFunctionsToProviderFormat(functions) {
        if (this.provider === 'grok' || this.provider === 'openai') {
            // OpenAI tools format: wrap in type="function"
            return functions.map(func => ({
                type: 'function',
                function: func
            }));
        } else if (this.provider === 'claude') {
            // Claude tools format: convert parameters to input_schema
            return functions.map(func => ({
                name: func.name,
                description: func.description || '',
                input_schema: func.parameters || {}
            }));
        } else if (this.provider === 'gemini') {
            // Gemini function declarations format
            // Already in correct format
            return functions;
        } else {
            // Unknown provider - return as-is and hope for the best
            return functions;
        }
    }

    /**
     * Convert messages to single prompt string (for Gemini)
     *
     * @param {Array<Object>} messages - Message array
     * @returns {string} Combined prompt
     * @private
     */
    _messagesToPrompt(messages) {
        const parts = [];

        for (const msg of messages) {
            const role = msg.role || 'user';
            const content = msg.content || '';

            if (role === 'system') {
                parts.push(`System: ${content}`);
            } else if (role === 'user') {
                parts.push(`User: ${content}`);
            } else if (role === 'assistant') {
                parts.push(`Assistant: ${content}`);
            }
        }

        return parts.join('\n\n');
    }

    /**
     * Normalize provider-specific response to standard format
     *
     * @param {Object} result - Provider-specific result
     * @param {Object} usage - Usage statistics
     * @returns {FunctionCallResult} Standardized result
     * @private
     */
    _normalizeResponse(result, usage) {
        // Extract content
        let content = result.content || '';
        if (Array.isArray(content)) {
            // Claude returns list of content blocks
            content = content.map(block => {
                if (typeof block === 'object' && block.text) {
                    return block.text;
                }
                return String(block);
            }).join(' ');
        }

        // Extract tool/function calls
        const toolCalls = result.tool_calls || [];

        // Normalize tool calls format
        const normalizedCalls = [];
        for (const call of toolCalls) {
            if (typeof call === 'object') {
                // OpenAI/Grok format - arguments come as JSON string, must parse
                let argsRaw = call.function?.arguments || '{}';
                let argsParsed;

                if (typeof argsRaw === 'string') {
                    try {
                        argsParsed = JSON.parse(argsRaw);
                    } catch (e) {
                        // If parsing fails, keep as string (fallback)
                        argsParsed = argsRaw;
                    }
                } else {
                    // Already an object (some providers return object directly)
                    argsParsed = argsRaw;
                }

                normalizedCalls.push({
                    id: call.id || '',
                    type: call.type || 'function',
                    function: {
                        name: call.function?.name || '',
                        arguments: argsParsed  // Now properly normalized to object
                    }
                });
            }
        }

        return new FunctionCallResult(
            content,
            normalizedCalls,
            usage,
            this.provider,
            result
        );
    }

    /**
     * Get usage statistics from last call
     *
     * @returns {Object} Usage stats
     */
    getUsageStats() {
        if (typeof this.llm.getLastUsageStats === 'function') {
            return this.llm.getLastUsageStats();
        }
        return {};
    }

    /**
     * Calculate cost for token usage
     *
     * @param {number} inputTokens - Input token count
     * @param {number} outputTokens - Output token count
     * @returns {Object} Cost breakdown
     */
    calculateCost(inputTokens, outputTokens) {
        if (typeof this.llm.calculateCost === 'function') {
            return this.llm.calculateCost(inputTokens, outputTokens);
        }
        return {
            input_cost: 0.0,
            output_cost: 0.0,
            total_cost: 0.0
        };
    }
}

/**
 * Factory function to create universal function calling wrapper
 *
 * @param {Object} llmInterface - Any LLM interface instance
 * @returns {UniversalFunctionCallingWrapper} Configured wrapper
 */
function createUniversalWrapper(llmInterface) {
    return new UniversalFunctionCallingWrapper(llmInterface);
}

module.exports = {
    FunctionCallResult,
    UniversalFunctionCallingWrapper,
    createUniversalWrapper
};
