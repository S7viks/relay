// Utility Functions
// Helper functions for formatting, validation, and data transformation

/**
 * Format response time in milliseconds to human-readable format
 */
function formatResponseTime(ms) {
    if (ms < 1000) {
        return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format token count with commas
 */
function formatTokenCount(count) {
    return count.toLocaleString();
}

/**
 * Format quality score (0.0-1.0) as percentage
 */
function formatQualityScore(score) {
    if (score === null || score === undefined) {
        return 'N/A';
    }
    return `${(score * 100).toFixed(0)}%`;
}

/**
 * Format cost display
 */
function formatCost(cost) {
    if (cost === 0 || cost === null || cost === undefined) {
        return 'Free';
    }
    if (cost < 0.000001) {
        return `$${(cost * 1000000).toFixed(2)}/M tokens`;
    }
    return `$${cost.toFixed(6)}/token`;
}

/**
 * Validate prompt input
 */
function validatePrompt(prompt) {
    if (!prompt || prompt.trim().length === 0) {
        return { valid: false, error: 'Prompt cannot be empty' };
    }
    if (prompt.length > 10000) {
        return { valid: false, error: 'Prompt is too long (max 10,000 characters)' };
    }
    return { valid: true, error: null };
}

/**
 * Validate model selection
 */
function validateModelSelection(selectedIds) {
    if (!selectedIds || selectedIds.length === 0) {
        return { valid: false, error: 'Please select at least one model' };
    }
    if (selectedIds.length > 10) {
        return { valid: false, error: 'Too many models selected (max 10)' };
    }
    return { valid: true, error: null };
}

/**
 * Validate query settings
 */
function validateQuerySettings(settings) {
    const errors = [];

    if (settings.max_tokens !== undefined) {
        if (settings.max_tokens < 50 || settings.max_tokens > 4096) {
            errors.push('Max tokens must be between 50 and 4096');
        }
    }

    if (settings.temperature !== undefined) {
        if (settings.temperature < 0 || settings.temperature > 2) {
            errors.push('Temperature must be between 0.0 and 2.0');
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

/**
 * Map legacy model names to registry IDs
 */
function normalizeModelId(legacyName) {
    const mapping = {
        'llama3': 'openrouter:meta-llama/llama-3.2-3b-instruct:free',
        'mistral': 'openrouter:mistralai/mistral-7b-instruct:free',
        'qwen': 'openrouter:qwen/qwen-2-7b-instruct:free',
        'glm': 'openrouter:z-ai/glm-4.5-air:free',
        'deepseek': 'openrouter:deepseek/deepseek-r1:free',
        'hf-llama': 'huggingface:meta-llama/Llama-3.1-8B-Instruct',
        'gpt4mini': 'openrouter:openai/gpt-4o-mini',
        'claude': 'openrouter:anthropic/claude-3.5-sonnet'
    };

    return mapping[legacyName] || legacyName;
}

/**
 * Transform legacy response format to unified format
 */
function transformLegacyResponse(legacyResponse) {
    const transformed = {};
    
    for (const [modelKey, response] of Object.entries(legacyResponse)) {
        transformed[modelKey] = {
            success: response.success,
            response: response.response || '',
            time: response.time || 0,
            tokens: response.tokens || 0,
            quality: response.quality || 0,
            model: response.model || modelKey,
            error: response.error || null
        };
    }
    
    return transformed;
}

/**
 * Transform UAIP response to display format
 */
function transformUAIPResponse(uaipResponse) {
    if (!uaipResponse || !uaipResponse.result) {
        return {
            success: false,
            response: 'Invalid response format',
            error: 'No result data'
        };
    }

    const result = uaipResponse.result;
    const status = uaipResponse.status || {};

    return {
        success: status.success !== false,
        response: result.data || '',
        time: result.processing_ms || 0,
        tokens: result.tokens_used || 0,
        quality: result.quality || 0,
        model: result.model_used || 'Unknown',
        error: uaipResponse.error ? uaipResponse.error.message : null,
        cost: uaipResponse.metadata?.cost_info?.total_cost || 0,
        uaip: true // Flag to indicate UAIP format
    };
}

/**
 * Debounce function for search/filter inputs
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Get provider display name
 */
function getProviderDisplayName(provider) {
    const names = {
        'openrouter': 'OpenRouter',
        'huggingface': 'HuggingFace',
        'google': 'Google',
        'openai': 'OpenAI',
        'anthropic': 'Anthropic'
    };
    return names[provider] || provider;
}
