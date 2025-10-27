/**
 * GrokInterface - Interface for xAI's Grok 4 model
 *
 * Port of Python agents_assembly/llm_interfaces/grok.py
 * Uses X.AI API endpoint with async HTTP requests
 */

const axios = require('axios');

class GrokInterface {
    /**
     * Initialize Grok interface
     *
     * @param {Object} options - Configuration options
     * @param {string} [options.apiKey] - X.AI API key (defaults to XAI_API_KEY env var)
     * @param {string} [options.model='grok-4-fast-reasoning'] - Model identifier
     * @param {string} [options.baseUrl='https://api.x.ai/v1'] - API base URL
     * @param {number} [options.maxTokens=4096] - Maximum tokens in response
     * @param {number} [options.temperature=0.7] - Sampling temperature (0-1)
     * @param {boolean} [options.useJsonMode=true] - Whether to request JSON-formatted responses
     */
    constructor(options = {}) {
        this.apiKey = options.apiKey || process.env.XAI_API_KEY;
        if (!this.apiKey) {
            throw new Error('Grok API key required (XAI_API_KEY env var or apiKey option)');
        }

        this.model = options.model || 'grok-4-fast-reasoning';
        this.baseUrl = options.baseUrl || 'https://api.x.ai/v1';
        this.maxTokens = options.maxTokens || 4096;
        this.temperature = options.temperature || 0.7;
        this.useJsonMode = options.useJsonMode !== undefined ? options.useJsonMode : true;
        this.provider = 'grok';

        // Grok model pricing per 1M tokens (USD)
        this.pricing = {
            'grok-4-fast-reasoning': { input: 0.20, output: 0.50 },
            'grok-4-fast': { input: 0.20, output: 0.50 },
            'grok-2-1212': { input: 2.00, output: 10.00 },
            'grok-beta': { input: 2.00, output: 10.00 }
        };

        // Model output token limits
        this.modelOutputLimits = {
            'grok-4-fast-reasoning': 2000000,  // 2M context
            'grok-4-fast': 2000000,
            'grok-2-1212': 131072,
            'grok-beta': 131072
        };

        // Headers for API requests
        this.headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
        };

        // Last usage statistics
        this.lastUsageStats = null;

        // Cumulative usage statistics for session
        this.totalStats = {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            total_cost: 0,
            api_calls: 0
        };

        console.log(`Grok interface initialized with model: ${this.model}`);
    }

    /**
     * Generate response using Grok API
     *
     * @param {Array<Object>} messages - List of message objects with 'role' and 'content'
     * @returns {Promise<string>} Generated text response
     */
    async generate(messages) {
        const startTime = Date.now();

        try {
            // Prepare messages for Grok API
            const formattedMessages = messages.map(msg => {
                const message = {
                    role: msg.role,
                    content: msg.content
                };

                // Add name field if present (for multi-agent scenarios)
                if (msg.name) {
                    message.name = msg.name;
                }

                return message;
            });

            // Add JSON instruction if enabled
            if (this.useJsonMode && formattedMessages.length > 0) {
                const lastMsg = formattedMessages[formattedMessages.length - 1];
                lastMsg.content = `${lastMsg.content}\n\nImportant: Respond with valid JSON only. No markdown, no explanations outside the JSON structure.`;
            }

            // Prepare request payload
            const payload = {
                model: this.model,
                messages: formattedMessages,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                stream: false
            };

            // Add response format hint for Grok
            if (this.useJsonMode) {
                payload.response_format = { type: 'json_object' };
            }

            // Make API request
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                payload,
                { headers: this.headers }
            );

            const data = response.data;

            // Extract content from response
            if (data.choices && data.choices.length > 0) {
                const content = data.choices[0].message.content;

                // Validate JSON if expected
                if (this.useJsonMode) {
                    try {
                        JSON.parse(content);
                    } catch (e) {
                        console.warn('Grok response was not valid JSON');
                    }
                }

                // Track usage and costs
                const usage = data.usage || {};
                const usageNormalized = this._normalizeUsageData(usage);
                this._updateUsageStats(usageNormalized, startTime);

                return content;
            } else {
                throw new Error('No content in Grok response');
            }

        } catch (error) {
            const errorMsg = `Grok API request failed: ${error.message}`;
            console.error(errorMsg);

            if (error.response) {
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
            }

            throw new Error(`Grok API error: ${error.message}`);
        }
    }

    /**
     * Generate response with Grok's chain-of-thought reasoning
     *
     * @param {Array<Object>} messages - Conversation history
     * @param {boolean} [enableCot=true] - Enable chain-of-thought reasoning
     * @returns {Promise<Object>} Response object with content and reasoning trace
     */
    async generateWithReasoning(messages, enableCot = true) {
        try {
            const payload = {
                model: this.model,
                messages: messages,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                stream: false,
                enable_reasoning: enableCot
            };

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                payload,
                { headers: this.headers }
            );

            const data = response.data;
            const result = {
                content: '',
                reasoning: null,
                usage: data.usage || {}
            };

            if (data.choices && data.choices.length > 0) {
                const choice = data.choices[0];
                result.content = choice.message.content;

                // Extract reasoning trace if available
                if (choice.reasoning) {
                    result.reasoning = choice.reasoning;
                }
            }

            return result;

        } catch (error) {
            console.error(`Grok reasoning API error: ${error.message}`);
            throw new Error(`Failed to use Grok with reasoning: ${error.message}`);
        }
    }

    /**
     * Generate response with OpenAI-compatible tool/function calling support
     *
     * @param {Array<Object>} messages - Conversation history
     * @param {Array<Object>} tools - List of tool definitions in OpenAI format
     * @param {string|Object} [toolChoice='auto'] - "auto", "none", or specific function
     * @returns {Promise<Object>} Response object with content and optional tool_calls
     */
    async generateWithTools(messages, tools, toolChoice = 'auto') {
        const startTime = Date.now();

        try {
            // Format messages for Grok API
            const formattedMessages = messages.map(msg => {
                const message = {
                    role: msg.role,
                    content: msg.content
                };

                if (msg.name) {
                    message.name = msg.name;
                }

                return message;
            });

            // Prepare request payload with tools
            const payload = {
                model: this.model,
                messages: formattedMessages,
                tools: tools,
                tool_choice: toolChoice,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                stream: false
            };

            // Make API request
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                payload,
                { headers: this.headers }
            );

            const data = response.data;

            // Parse response
            const result = {
                content: '',
                tool_calls: [],
                usage: data.usage || {}
            };

            if (data.choices && data.choices.length > 0) {
                const message = data.choices[0].message;

                // Extract content (may be empty if tool call)
                if (message.content) {
                    result.content = message.content;
                }

                // Extract tool calls if present
                if (message.tool_calls) {
                    result.tool_calls = message.tool_calls;
                }

                // Track usage statistics
                if (data.usage) {
                    const usageNormalized = this._normalizeUsageData(data.usage);
                    this._updateUsageStats(usageNormalized, startTime);
                }
            }

            return result;

        } catch (error) {
            console.error(`Grok API request with tools failed: ${error.message}`);
            throw new Error(`Grok API error: ${error.message}`);
        }
    }

    /**
     * Normalize Grok usage data structure to extract nested token details
     *
     * @param {Object} usage - Raw usage data from API
     * @returns {Object} Normalized usage data
     * @private
     */
    _normalizeUsageData(usage) {
        const normalized = {
            prompt_tokens: usage.prompt_tokens || 0,
            completion_tokens: usage.completion_tokens || 0,
            total_tokens: usage.total_tokens || 0
        };

        // Extract nested details
        const promptDetails = usage.prompt_tokens_details || {};
        const completionDetails = usage.completion_tokens_details || {};

        normalized.cached_tokens = promptDetails.cached_tokens || 0;
        normalized.reasoning_tokens = completionDetails.reasoning_tokens || 0;

        return normalized;
    }

    /**
     * Update usage statistics and calculate costs
     *
     * @param {Object} usage - Normalized usage data
     * @param {number} startTime - Request start timestamp
     * @private
     */
    _updateUsageStats(usage, startTime) {
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        const totalTokens = inputTokens + outputTokens;

        // Calculate cost using model-specific pricing
        const modelPricing = this.pricing[this.model] || { input: 0.20, output: 0.50 };
        const costInput = (inputTokens / 1_000_000) * modelPricing.input;
        const costOutput = (outputTokens / 1_000_000) * modelPricing.output;
        const totalCost = costInput + costOutput;

        // Store usage stats for external tracking
        this.lastUsageStats = {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            reasoning_tokens: usage.reasoning_tokens || 0,
            cached_tokens: usage.cached_tokens || 0,
            total_tokens: totalTokens,
            total_cost: totalCost,
            cost_input: costInput,
            cost_output: costOutput,
            duration_ms: Date.now() - startTime
        };

        // Accumulate into total stats
        this.totalStats.input_tokens += inputTokens;
        this.totalStats.output_tokens += outputTokens;
        this.totalStats.total_tokens += totalTokens;
        this.totalStats.total_cost += totalCost;
        this.totalStats.api_calls += 1;
    }

    /**
     * Get statistics from the last API call
     *
     * @returns {Object} Usage statistics
     */
    getLastUsageStats() {
        return this.lastUsageStats || {};
    }

    /**
     * Get cumulative statistics for all API calls in this session
     *
     * @returns {Object} Total usage statistics
     */
    getTotalStats() {
        return {
            ...this.totalStats,
            model: this.model,
            pricing: this.pricing[this.model]
        };
    }

    /**
     * Calculate cost for token usage
     *
     * @param {number} inputTokens - Input token count
     * @param {number} outputTokens - Output token count
     * @param {string} [modelName] - Model name (defaults to current model)
     * @returns {Object} Cost breakdown
     */
    calculateCost(inputTokens, outputTokens, modelName = null) {
        const targetModel = modelName || this.model;
        const modelPricing = this.pricing[targetModel] || { input: 0.20, output: 0.50 };

        const costInput = (inputTokens / 1_000_000) * modelPricing.input;
        const costOutput = (outputTokens / 1_000_000) * modelPricing.output;
        const totalCost = costInput + costOutput;

        return {
            input_cost: costInput,
            output_cost: costOutput,
            total_cost: totalCost,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens
        };
    }

    /**
     * Get pricing for a specific model
     *
     * @param {string} [modelName] - Model name (defaults to current model)
     * @returns {Object} Pricing data
     */
    getPricing(modelName = null) {
        const targetModel = modelName || this.model;
        return this.pricing[targetModel] || { input: 0.0, output: 0.0 };
    }

    /**
     * Get list of supported models
     *
     * @returns {Array<string>} List of model names
     */
    getSupportedModels() {
        return Object.keys(this.pricing);
    }

    /**
     * Get the output token limit for a model
     *
     * @param {string} [modelName] - Model name (defaults to current model)
     * @returns {number} Output token limit
     */
    getModelOutputLimit(modelName = null) {
        const targetModel = modelName || this.model;
        return this.modelOutputLimits[targetModel] || 131072;
    }
}

module.exports = GrokInterface;
