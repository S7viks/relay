// Model Management Module
// Handles model loading, filtering, searching, and selection

/**
 * Load models from API
 */
async function loadModelsFromAPI() {
    try {
        const models = await fetchAllModels();
        setModels(models);
        return models;
    } catch (error) {
        console.error('Failed to load models:', error);
        showToast('error', 'Failed to load models', error.message);
        return [];
    }
}

/**
 * Filter models based on active filters
 */
function filterModels(models, filters) {
    if (!models || models.length === 0) {
        return [];
    }

    let filtered = [...models];

    // Filter by provider
    if (filters.provider && filters.provider !== 'all') {
        filtered = filtered.filter(model => model.provider === filters.provider);
    }

    // Filter by cost
    if (filters.cost === 'free') {
        filtered = filtered.filter(model => isModelFree(model));
    } else if (filters.cost === 'premium') {
        filtered = filtered.filter(model => !isModelFree(model));
    }

    // Filter by tags
    if (filters.tags && filters.tags.length > 0) {
        filtered = filtered.filter(model => {
            return filters.tags.some(tag => model.tags && model.tags.includes(tag));
        });
    }

    // Filter by task capability
    if (filters.task && filters.task !== 'all') {
        filtered = filtered.filter(model => {
            return model.capabilities && model.capabilities.includes(filters.task);
        });
    }

    // Search by name
    if (filters.search && filters.search.trim()) {
        const searchTerm = filters.search.toLowerCase();
        filtered = filtered.filter(model => {
            const displayName = ((model.display_name || model.DisplayName) || '').toLowerCase();
            const modelName = ((model.model_name || model.ModelName) || '').toLowerCase();
            return displayName.includes(searchTerm) || modelName.includes(searchTerm);
        });
    }

    return filtered;
}

/**
 * Search models by query string
 */
function searchModels(models, query) {
    if (!query || query.trim() === '') {
        return models;
    }

    const searchTerm = query.toLowerCase();
    return models.filter(model => {
        // Handle both Go JSON format (capitalized) and snake_case format
        const displayName = ((model.display_name || model.DisplayName) || '').toLowerCase();
        const modelName = ((model.model_name || model.ModelName) || '').toLowerCase();
        const provider = ((model.provider || model.Provider) || '').toLowerCase();
        return displayName.includes(searchTerm) || 
               modelName.includes(searchTerm) || 
               provider.includes(searchTerm);
    });
}

/**
 * Group models by provider
 */
function groupModelsByProvider(models) {
    const grouped = {};
    models.forEach(model => {
        // Handle both Go JSON format (capitalized) and snake_case format
        const provider = model.provider || model.Provider || 'unknown';
        if (!grouped[provider]) {
            grouped[provider] = [];
        }
        grouped[provider].push(model);
    });
    return grouped;
}

/**
 * Check if model is free
 */
function isModelFree(model) {
    // Handle both Go JSON format (capitalized) and snake_case format
    const costInfo = model.cost_info || model.CostInfo || {};
    const costPerToken = costInfo.cost_per_token || costInfo.CostPerToken || 0;
    return costPerToken === 0;
}

/**
 * Get model provider
 */
function getModelProvider(model) {
    // Handle both Go JSON format (capitalized) and snake_case format
    return model.provider || model.Provider || 'unknown';
}

/**
 * Sort models by criteria
 */
function sortModels(models, criteria = 'name') {
    const sorted = [...models];
    
    switch (criteria) {
        case 'quality':
            sorted.sort((a, b) => {
                const qualityA = a.quality_score || a.QualityScore || 0;
                const qualityB = b.quality_score || b.QualityScore || 0;
                return qualityB - qualityA;
            });
            break;
        case 'cost':
            sorted.sort((a, b) => {
                const costInfoA = a.cost_info || a.CostInfo || {};
                const costInfoB = b.cost_info || b.CostInfo || {};
                const costA = costInfoA.cost_per_token || costInfoA.CostPerToken || 0;
                const costB = costInfoB.cost_per_token || costInfoB.CostPerToken || 0;
                return costA - costB;
            });
            break;
        case 'name':
            sorted.sort((a, b) => {
                const nameA = ((a.display_name || a.DisplayName) || '').toLowerCase();
                const nameB = ((b.display_name || b.DisplayName) || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            break;
        case 'provider':
            sorted.sort((a, b) => {
                const providerA = ((a.provider || a.Provider) || '').toLowerCase();
                const providerB = ((b.provider || b.Provider) || '').toLowerCase();
                return providerA.localeCompare(providerB);
            });
            break;
    }
    
    return sorted;
}

/**
 * Get all unique tags from models
 */
function getAllTags(models) {
    const tagSet = new Set();
    models.forEach(model => {
        if (model.tags && Array.isArray(model.tags)) {
            model.tags.forEach(tag => tagSet.add(tag));
        }
    });
    return Array.from(tagSet).sort();
}

/**
 * Get all unique providers from models
 */
function getAllProviders(models) {
    const providerSet = new Set();
    models.forEach(model => {
        // Handle both Go JSON format (capitalized) and snake_case format
        const provider = model.provider || model.Provider;
        if (provider) {
            providerSet.add(provider);
        }
    });
    return Array.from(providerSet).sort();
}

/**
 * Select all free models
 */
function selectAllFreeModels() {
    const models = getModels();
    const freeModelIds = models
        .filter(model => isModelFree(model))
        .map(model => model.id || model.ID || '')
        .filter(id => id !== '');
    setSelectedModels(freeModelIds);
    if (typeof renderModelSelection === 'function') {
        renderModelSelection();
    }
    showToast('info', `${freeModelIds.length} free models selected`);
}

/**
 * Select all models
 */
function selectAllModels() {
    const models = getModels();
    const allModelIds = models
        .map(model => model.id || model.ID || '')
        .filter(id => id !== '');
    setSelectedModels(allModelIds);
    if (typeof renderModelSelection === 'function') {
        renderModelSelection();
    }
    showToast('info', `${allModelIds.length} models selected`);
}

/**
 * Deselect all models
 */
function deselectAllModels() {
    clearSelectedModels();
    if (typeof renderModelSelection === 'function') {
        renderModelSelection();
    }
    showToast('info', 'All models deselected');
}
