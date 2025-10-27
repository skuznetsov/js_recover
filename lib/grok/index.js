/**
 * Grok 4 Fast Reasoning - NodeJS Port
 * =====================================
 *
 * Port of Python agents_assembly Grok library
 * Provides interface to xAI's Grok-4 model with function calling support
 */

const GrokInterface = require('./interface');
const { UniversalFunctionCallingWrapper, FunctionCallResult, createUniversalWrapper } = require('./universal_wrapper');

module.exports = {
    GrokInterface,
    UniversalFunctionCallingWrapper,
    FunctionCallResult,
    createUniversalWrapper
};
