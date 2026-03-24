// State Management Module
// Manages application state and localStorage persistence

const AppState = {
    models: [],
    selectedModels: [],
    queryHistory: [],
    settings: {
        defaultStrategy: 'free_only',
        defaultTask: 'generate',
        defaultMaxTokens: 200,
        defaultTemperature: 0.7,
        preferredModels: []
    },
    filters: {
        provider: 'all',
        cost: 'all',
        tags: [],
        search: '',
        task: 'all'
    },
    uiState: {
        loading: false,
        queryMode: 'compare', // 'compare', 'smart', 'single'
        errors: [],
        currentQuery: null,
        reasoningMode: false
    },
    listeners: []
};

/**
 * Subscribe to state changes
 */
function subscribeStateChange(callback) {
    AppState.listeners.push(callback);
}

/**
 * Notify all listeners of state change
 */
function notifyStateChange() {
    AppState.listeners.forEach(callback => {
        try {
            callback(AppState);
        } catch (error) {
            console.error('State change listener error:', error);
        }
    });

    // Update selected models dropdown when selection changes
    if (typeof renderSelectedModelsDropdown === 'function') {
        renderSelectedModelsDropdown();
    }
}

/**
 * Update models list
 */
function setModels(models) {
    AppState.models = models;
    notifyStateChange();
}

/**
 * Get models list
 */
function getModels() {
    return AppState.models;
}

/**
 * Update selected models
 */
function setSelectedModels(modelIds) {
    AppState.selectedModels = modelIds;
    saveToLocalStorage('selectedModels', modelIds);
    notifyStateChange();
}

/**
 * Get selected models
 */
function getSelectedModels() {
    return AppState.selectedModels;
}

/**
 * Toggle model selection
 */
function toggleModelSelection(modelId) {
    const index = AppState.selectedModels.indexOf(modelId);
    if (index > -1) {
        AppState.selectedModels.splice(index, 1);
    } else {
        AppState.selectedModels.push(modelId);
    }
    saveToLocalStorage('selectedModels', AppState.selectedModels);
    notifyStateChange();
}

/**
 * Clear all selected models
 */
function clearSelectedModels() {
    AppState.selectedModels = [];
    saveToLocalStorage('selectedModels', []);
    notifyStateChange();
}

/**
 * Add query to history
 */
function addToHistory(query, response, config) {
    const historyItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        prompt: query,
        response: response,
        config: config,
        queryMode: AppState.uiState.queryMode
    };

    AppState.queryHistory.unshift(historyItem);

    // Keep only last 50 items
    if (AppState.queryHistory.length > 50) {
        AppState.queryHistory = AppState.queryHistory.slice(0, 50);
    }

    saveToLocalStorage('queryHistory', AppState.queryHistory);
    notifyStateChange();
}

/**
 * Get query history
 */
function getHistory() {
    return AppState.queryHistory;
}

/**
 * Clear query history
 */
function clearHistory() {
    AppState.queryHistory = [];
    saveToLocalStorage('queryHistory', []);
    notifyStateChange();
}

/**
 * Remove item from history
 */
function removeHistoryItem(itemId) {
    AppState.queryHistory = AppState.queryHistory.filter(item => item.id !== itemId);
    saveToLocalStorage('queryHistory', AppState.queryHistory);
    notifyStateChange();
}

/**
 * Update settings
 */
function updateSettings(newSettings) {
    AppState.settings = { ...AppState.settings, ...newSettings };
    saveToLocalStorage('settings', AppState.settings);
    notifyStateChange();
}

/**
 * Get settings
 */
function getSettings() {
    return AppState.settings;
}

/**
 * Update filters
 */
function setFilters(filters) {
    AppState.filters = { ...AppState.filters, ...filters };
    notifyStateChange();
}

/**
 * Get filters
 */
function getFilters() {
    return AppState.filters;
}

/**
 * Update UI state
 */
function setUIState(updates) {
    AppState.uiState = { ...AppState.uiState, ...updates };
    notifyStateChange();
}

/**
 * Get UI state
 */
function getUIState() {
    return AppState.uiState;
}

/**
 * Save to localStorage
 */
function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(`gaiol_${key}`, JSON.stringify(value));
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
    }
}

/**
 * Load from localStorage
 */
function loadFromLocalStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(`gaiol_${key}`);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Failed to load from localStorage:', error);
        return defaultValue;
    }
}

/**
 * Initialize state from localStorage
 */
function initializeState() {
    AppState.selectedModels = loadFromLocalStorage('selectedModels', []);
    AppState.queryHistory = loadFromLocalStorage('queryHistory', []);
    AppState.settings = { ...AppState.settings, ...loadFromLocalStorage('settings', {}) };
}

// New state management for enhanced features

/**
 * Favorites Management
 */
function getFavorites() {
    return loadFromLocalStorage('favorites', []);
}

function addFavorite(favorite) {
    const favorites = getFavorites();
    favorites.unshift(favorite);
    // Keep only last 20
    if (favorites.length > 20) {
        favorites.splice(20);
    }
    saveToLocalStorage('favorites', favorites);
    notifyStateChange();
}

function removeFavorite(favoriteId) {
    const favorites = getFavorites();
    const filtered = favorites.filter(f => f.id !== favoriteId);
    saveToLocalStorage('favorites', filtered);
    notifyStateChange();
}

/**
 * Filter Presets Management
 */
function getFilterPresets() {
    return loadFromLocalStorage('filterPresets', []);
}

function addFilterPreset(preset) {
    const presets = getFilterPresets();
    presets.unshift(preset);
    // Keep only last 10
    if (presets.length > 10) {
        presets.splice(10);
    }
    saveToLocalStorage('filterPresets', presets);
    notifyStateChange();
}

function removeFilterPreset(presetId) {
    const presets = getFilterPresets();
    const filtered = presets.filter(p => p.id !== presetId);
    saveToLocalStorage('filterPresets', filtered);
    notifyStateChange();
}

/**
 * Prompt Templates
 */
function getPromptTemplates() {
    const defaultTemplates = [
        { id: '1', name: 'Write Copy', category: 'Writing', prompt: 'Write professional copy for...' },
        { id: '2', name: 'Explain Concept', category: 'Analysis', prompt: 'Explain the concept of...' },
        { id: '3', name: 'Generate Code', category: 'Code', prompt: 'Write a function to...' },
        { id: '4', name: 'Summarize Text', category: 'Analysis', prompt: 'Summarize the following text:' },
        { id: '5', name: 'Create Story', category: 'Creative', prompt: 'Write a story about...' }
    ];

    const customTemplates = loadFromLocalStorage('promptTemplates', []);
    return [...defaultTemplates, ...customTemplates];
}

function addPromptTemplate(template) {
    const templates = loadFromLocalStorage('promptTemplates', []);
    templates.unshift(template);
    saveToLocalStorage('promptTemplates', templates);
    notifyStateChange();
}

/**
 * Activity Feed
 */
function getActivityFeed() {
    return loadFromLocalStorage('activityFeed', []);
}

function addToActivityFeed(activity) {
    const activities = getActivityFeed();
    activities.push(activity);
    // Keep only last 50
    if (activities.length > 50) {
        activities.splice(0, activities.length - 50);
    }
    saveToLocalStorage('activityFeed', activities);
    notifyStateChange();
}

/**
 * Session Statistics
 */
function getSessionStats() {
    const today = new Date().toDateString();
    const stats = loadFromLocalStorage('sessionStats', {});

    // Reset if new day
    if (stats.date !== today) {
        return {
            date: today,
            queriesCount: 0,
            tokensUsed: 0,
            totalCost: 0,
            avgResponseTime: 0,
            modelsUsedCount: 0,
            responseTimes: []
        };
    }

    return stats;
}

function updateSessionStats(updates) {
    const today = new Date().toDateString();
    const stats = getSessionStats();

    const newStats = {
        ...stats,
        ...updates,
        date: today
    };

    // Calculate average response time
    if (newStats.responseTimes && newStats.responseTimes.length > 0) {
        const sum = newStats.responseTimes.reduce((a, b) => a + b, 0);
        newStats.avgResponseTime = Math.round(sum / newStats.responseTimes.length);
    }

    saveToLocalStorage('sessionStats', newStats);
    notifyStateChange();
}

function resetSessionStatistics() {
    const today = new Date().toDateString();
    saveToLocalStorage('sessionStats', {
        date: today,
        queriesCount: 0,
        tokensUsed: 0,
        totalCost: 0,
        avgResponseTime: 0,
        modelsUsedCount: 0,
        responseTimes: []
    });
    notifyStateChange();
}

/**
 * Model Performance Tracking
 */
function getModelPerformance() {
    return loadFromLocalStorage('modelPerformance', {});
}

function updateModelPerformance(modelId, data) {
    const performance = getModelPerformance();

    if (!performance[modelId]) {
        performance[modelId] = {
            queryCount: 0,
            successCount: 0,
            totalTime: 0,
            lastUsed: null
        };
    }

    performance[modelId] = {
        ...performance[modelId],
        ...data,
        queryCount: (performance[modelId].queryCount || 0) + 1,
        lastUsed: new Date().toISOString()
    };

    if (data.success !== false) {
        performance[modelId].successCount = (performance[modelId].successCount || 0) + 1;
    }

    if (data.responseTime) {
        performance[modelId].totalTime = (performance[modelId].totalTime || 0) + data.responseTime;
    }

    // Calculate averages
    if (performance[modelId].queryCount > 0) {
        performance[modelId].avgTime = Math.round(performance[modelId].totalTime / performance[modelId].queryCount);
        performance[modelId].successRate = performance[modelId].successCount / performance[modelId].queryCount;
    }

    saveToLocalStorage('modelPerformance', performance);
    notifyStateChange();
}

// Make new functions globally available
window.getFavorites = getFavorites;
window.addFavorite = addFavorite;
window.removeFavorite = removeFavorite;
window.getFilterPresets = getFilterPresets;
window.addFilterPreset = addFilterPreset;
window.removeFilterPreset = removeFilterPreset;
window.getPromptTemplates = getPromptTemplates;
window.addPromptTemplate = addPromptTemplate;
window.getActivityFeed = getActivityFeed;
window.addToActivityFeed = addToActivityFeed;
window.getSessionStats = getSessionStats;
window.updateSessionStats = updateSessionStats;
window.resetSessionStatistics = resetSessionStatistics;
window.getModelPerformance = getModelPerformance;
window.updateModelPerformance = updateModelPerformance;

// Initialize on load
initializeState();
