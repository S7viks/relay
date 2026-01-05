// Sidebar Features Module
// Implements all enhanced sidebar functionality

/**
 * Toggle sidebar section
 */
function toggleSection(sectionId) {
    const section = document.querySelector(`[data-section="${sectionId}"]`);
    if (section) {
        section.classList.toggle('collapsed');
        // Save state
        const isCollapsed = section.classList.contains('collapsed');
        localStorage.setItem(`sidebar_section_${sectionId}`, isCollapsed.toString());
    }
}

/**
 * Initialize sidebar sections state
 */
function initializeSidebarSections() {
    document.querySelectorAll('.sidebar-section.collapsible, .sidebar-section-compact.collapsible').forEach(section => {
        const sectionId = section.dataset.section;
        const savedState = localStorage.getItem(`sidebar_section_${sectionId}`);
        if (savedState === 'true') {
            section.classList.add('collapsed');
        }
    });
}

/**
 * Quick Actions Handlers
 */
function handleNewChat() {
    clearForm();
    showToast('success', 'New chat started');
}

function handleClearSelection() {
    clearSelectedModels();
    renderSelectedModelsDropdown();
    showToast('info', 'Selection cleared');
}

function handleExportResults() {
    const currentResults = getCurrentResults();
    if (!currentResults || Object.keys(currentResults).length === 0) {
        showToast('error', 'No results to export');
        return;
    }
    exportAsJSON();
}

function handleCopyAllResponses() {
    const currentResults = getCurrentResults();
    if (!currentResults || Object.keys(currentResults).length === 0) {
        showToast('error', 'No responses to copy');
        return;
    }

    let text = '';
    Object.entries(currentResults).forEach(([model, response]) => {
        text += `=== ${model} ===\n${response.content || response.text || ''}\n\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        showToast('success', 'All responses copied');
    }).catch(() => {
        showToast('error', 'Failed to copy');
    });
}

/**
 * Quick Settings Handlers
 */
function updateQuickTemp(value) {
    const quickTempValueEl = document.getElementById('quickTempValue');
    if (quickTempValueEl) quickTempValueEl.textContent = value;
    const tempInput = document.getElementById('defaultTemperature');
    if (tempInput) tempInput.value = value;
    const tempInput2 = document.getElementById('temperatureInput');
    if (tempInput2) tempInput2.value = value;
}

function updateQuickTokens(value) {
    const tokensInput = document.getElementById('defaultMaxTokens');
    if (tokensInput) tokensInput.value = value;
    const tokensInput2 = document.getElementById('maxTokensInput');
    if (tokensInput2) tokensInput2.value = value;
}

function updateQuickStrategy(value) {
    const strategySelect = document.getElementById('defaultStrategy');
    if (strategySelect) strategySelect.value = value;
    const strategySelect2 = document.getElementById('strategySelect');
    if (strategySelect2) strategySelect2.value = value;
}

function updateQuickTask(value) {
    const taskSelect = document.getElementById('taskSelect');
    if (taskSelect) taskSelect.value = value;
}

/**
 * Cost Tracker
 */
function updateCostTracker() {
    const selectedModels = getSelectedModels();
    const models = getModels();
    let estimatedCost = 0;

    selectedModels.forEach(modelId => {
        const model = models.find(m => (m.id || m.ID) === modelId);
        if (model) {
            const costInfo = model.cost_info || model.CostInfo || {};
            const costPerToken = costInfo.cost_per_token || costInfo.CostPerToken || 0;
            const maxTokens = parseInt(document.getElementById('quickMaxTokens')?.value || 200);
            estimatedCost += costPerToken * maxTokens;
        }
    });

    const sessionStats = getSessionStats();
    const sessionCost = sessionStats.totalCost || 0;
    const perQueryCost = sessionStats.queriesCount > 0
        ? sessionCost / sessionStats.queriesCount
        : 0;

    // Add null checks before setting textContent
    const estimatedCostEl = document.getElementById('estimatedCost');
    const sessionCostEl = document.getElementById('sessionCost');
    const perQueryCostEl = document.getElementById('perQueryCost');

    if (estimatedCostEl) estimatedCostEl.textContent = `$${estimatedCost.toFixed(4)}`;
    if (sessionCostEl) sessionCostEl.textContent = `$${sessionCost.toFixed(4)}`;
    if (perQueryCostEl) perQueryCostEl.textContent = `$${perQueryCost.toFixed(4)}`;
}

/**
 * Session Statistics
 */
function updateSessionStats() {
    const stats = getSessionStats();

    // Add null checks before setting textContent
    const queriesTodayEl = document.getElementById('queriesToday');
    const tokensUsedEl = document.getElementById('tokensUsed');
    const avgResponseTimeEl = document.getElementById('avgResponseTime');
    const modelsUsedCountEl = document.getElementById('modelsUsedCount');

    if (queriesTodayEl) queriesTodayEl.textContent = stats.queriesCount || 0;
    if (tokensUsedEl) tokensUsedEl.textContent = formatNumber(stats.tokensUsed || 0);
    if (avgResponseTimeEl) avgResponseTimeEl.textContent = stats.avgResponseTime
        ? `${stats.avgResponseTime}ms`
        : '-';
    if (modelsUsedCountEl) modelsUsedCountEl.textContent = stats.modelsUsedCount || 0;
}

function resetSessionStats() {
    if (confirm('Reset session statistics?')) {
        resetSessionStatistics();
        updateSessionStats();
        showToast('success', 'Session stats reset');
    }
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

/**
 * Model Performance Metrics
 */
function renderModelPerformance() {
    const performanceData = getModelPerformance();
    const container = document.getElementById('modelPerformanceList');
    if (!container) return;

    if (Object.keys(performanceData).length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No performance data yet</div>';
        return;
    }

    let html = '';
    Object.entries(performanceData).slice(0, 5).forEach(([modelId, data]) => {
        const model = getModels().find(m => (m.id || m.ID) === modelId);
        const modelName = model ? (model.display_name || model.model_name || modelId) : modelId;
        html += `
            <div class="model-performance-item">
                <div class="model-performance-name">${escapeHtml(modelName.substring(0, 20))}</div>
                <div class="model-performance-metrics">
                    <span>${data.avgTime || 0}ms</span>
                    <span>${((data.successRate || 0) * 100).toFixed(0)}%</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Model Recommendations
 */
function updateModelRecommendations() {
    const prompt = document.getElementById('promptInput')?.value || '';
    const container = document.getElementById('modelRecommendations');
    if (!container) return;

    if (!prompt.trim()) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">Enter a prompt for recommendations</div>';
        return;
    }

    const models = getModels();
    const recommendations = getRecommendedModels(prompt, models);

    if (recommendations.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No recommendations</div>';
        return;
    }

    let html = '';
    recommendations.slice(0, 3).forEach(rec => {
        html += `
            <div class="recommendation-item" onclick="selectRecommendedModel('${rec.id}')">
                ${escapeHtml(rec.name.substring(0, 25))}
                <span class="recommendation-badge">${rec.reason}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function selectRecommendedModel(modelId) {
    toggleModelSelectionUI(modelId);
    showToast('success', 'Model added to selection');
}

function getRecommendedModels(prompt, models) {
    const promptLower = prompt.toLowerCase();
    const recommendations = [];

    // Simple recommendation logic
    models.forEach(model => {
        let score = 0;
        let reason = '';

        // Check if free
        if (isModelFree(model)) {
            score += 10;
            reason = 'Free';
        }

        // Check task type
        if (promptLower.includes('code') && model.tags && model.tags.includes('code')) {
            score += 20;
            reason = 'Code';
        } else if (promptLower.includes('analyze') && model.tags && model.tags.includes('analysis')) {
            score += 20;
            reason = 'Analysis';
        }

        // Quality score
        const quality = model.quality_score || model.QualityScore || 0;
        score += quality;

        if (score > 0) {
            recommendations.push({
                id: model.id || model.ID,
                name: model.display_name || model.model_name || model.id,
                score: score,
                reason: reason || 'Recommended'
            });
        }
    });

    return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Favorites Management
 */
function renderFavorites() {
    const favorites = getFavorites();
    const container = document.getElementById('favoritesList');
    if (!container) return;

    if (favorites.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No favorites yet</div>';
        return;
    }

    let html = '';
    favorites.slice(0, 5).forEach(fav => {
        html += `
            <div class="favorite-item" onclick="loadFavorite('${fav.id}')">
                <div class="favorite-item-name">${escapeHtml(fav.name.substring(0, 25))}</div>
                <div class="favorite-item-meta">${fav.type}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function saveCurrentAsFavorite() {
    const prompt = document.getElementById('promptInput')?.value || '';
    const selectedModels = getSelectedModels();

    if (!prompt.trim() && selectedModels.length === 0) {
        showToast('error', 'Nothing to save');
        return;
    }

    const name = prompt.trim() || `Model Set ${selectedModels.length}`;
    const favorite = {
        id: Date.now().toString(),
        name: name.substring(0, 50),
        type: selectedModels.length > 0 ? 'Model Set' : 'Prompt',
        prompt: prompt,
        models: selectedModels,
        timestamp: new Date().toISOString()
    };

    addFavorite(favorite);
    renderFavorites();
    showToast('success', 'Saved to favorites');
}

function loadFavorite(favoriteId) {
    const favorites = getFavorites();
    const favorite = favorites.find(f => f.id === favoriteId);

    if (!favorite) {
        showToast('error', 'Favorite not found');
        return;
    }

    if (favorite.prompt) {
        const promptInput = document.getElementById('promptInput');
        if (promptInput) {
            promptInput.value = favorite.prompt;
            if (typeof autoResizeTextarea === 'function') {
                autoResizeTextarea(promptInput);
            }
            if (typeof updateCharCount === 'function') {
                updateCharCount();
            }
        }
    }

    if (favorite.models && favorite.models.length > 0) {
        setSelectedModels(favorite.models);
        renderSelectedModelsDropdown();
    }

    showToast('success', 'Favorite loaded');
}

/**
 * Filter Presets
 */
function renderFilterPresets() {
    const presets = getFilterPresets();
    const container = document.getElementById('filterPresetsList');
    if (!container) return;

    if (presets.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No presets yet</div>';
        return;
    }

    let html = '';
    presets.forEach(preset => {
        html += `
            <div class="preset-item" onclick="applyFilterPreset('${preset.id}')">
                <span>${escapeHtml(preset.name)}</span>
                <button class="icon-btn-small" onclick="event.stopPropagation(); deleteFilterPreset('${preset.id}')" style="width: 20px; height: 20px;">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 5l10 10M15 5l-10 10"/>
                    </svg>
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

function saveCurrentFilterPreset() {
    const filters = getFilters();
    const name = prompt('Enter preset name:');

    if (!name || !name.trim()) {
        return;
    }

    const preset = {
        id: Date.now().toString(),
        name: name.trim(),
        filters: { ...filters },
        timestamp: new Date().toISOString()
    };

    addFilterPreset(preset);
    renderFilterPresets();
    showToast('success', 'Preset saved');
}

function applyFilterPreset(presetId) {
    const presets = getFilterPresets();
    const preset = presets.find(p => p.id === presetId);

    if (!preset) {
        showToast('error', 'Preset not found');
        return;
    }

    setFilters(preset.filters);
    if (typeof renderFilterControls === 'function') {
        renderFilterControls();
    }
    if (typeof renderModelSelection === 'function') {
        renderModelSelection();
    }

    showToast('success', 'Preset applied');
}

function deleteFilterPreset(presetId) {
    if (confirm('Delete this preset?')) {
        removeFilterPreset(presetId);
        renderFilterPresets();
        showToast('success', 'Preset deleted');
    }
}

/**
 * Prompt Templates
 */
function renderPromptTemplates() {
    const templates = getPromptTemplates();
    const container = document.getElementById('promptTemplatesList');
    if (!container) return;

    if (templates.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No templates</div>';
        return;
    }

    let html = '';
    templates.slice(0, 5).forEach(template => {
        html += `
            <div class="template-item" onclick="insertTemplate('${template.id}')">
                <div class="template-item-name">${escapeHtml(template.name)}</div>
                <div class="template-item-category">${template.category}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function insertTemplate(templateId) {
    const templates = getPromptTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
        showToast('error', 'Template not found');
        return;
    }

    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = template.prompt;
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(promptInput);
        }
        promptInput.focus();
        updateCharCount();
    }

    showToast('success', 'Template inserted');
}

/**
 * Activity Feed
 */
function addActivityItem(type, message) {
    const activity = {
        id: Date.now().toString(),
        type: type,
        message: message,
        timestamp: new Date().toISOString()
    };

    addToActivityFeed(activity);
    renderActivityFeed();
}

function renderActivityFeed() {
    const activities = getActivityFeed();
    const container = document.getElementById('activityFeedList');
    if (!container) return;

    if (activities.length === 0) {
        container.innerHTML = '<div style="font-size: 11px; color: var(--text-tertiary); text-align: center; padding: 10px;">No activity</div>';
        return;
    }

    let html = '';
    activities.slice(0, 10).reverse().forEach(activity => {
        const time = new Date(activity.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        html += `
            <div class="activity-item">
                ${escapeHtml(activity.message)}
                <div class="activity-item-time">${time}</div>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Export Functions
 */
function exportAsJSON() {
    const results = getCurrentResults();
    if (!results || Object.keys(results).length === 0) {
        showToast('error', 'No results to export');
        return;
    }

    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gaiol-results-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported as JSON');
}

function exportAsMarkdown() {
    const results = getCurrentResults();
    if (!results || Object.keys(results).length === 0) {
        showToast('error', 'No results to export');
        return;
    }

    let markdown = '# GAIOL Query Results\n\n';
    Object.entries(results).forEach(([model, response]) => {
        markdown += `## ${model}\n\n`;
        markdown += `${response.content || response.text || ''}\n\n`;
    });

    const dataBlob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gaiol-results-${new Date().toISOString().split('T')[0]}.md`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported as Markdown');
}

function exportAsCSV() {
    const results = getCurrentResults();
    if (!results || Object.keys(results).length === 0) {
        showToast('error', 'No results to export');
        return;
    }

    let csv = 'Model,Response\n';
    Object.entries(results).forEach(([model, response]) => {
        const content = (response.content || response.text || '').replace(/"/g, '""');
        csv += `"${model}","${content}"\n`;
    });

    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gaiol-results-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported as CSV');
}

/**
 * Keyboard Shortcuts
 */
function renderKeyboardShortcuts(containerId = 'keyboardShortcutsList') {
    const shortcuts = [
        { key: '⌘K / Ctrl+K', action: 'Global search' },
        { key: '⌘Enter / Ctrl+Enter', action: 'Send query' },
        { key: '⌘/ / Ctrl+/', action: 'Show shortcuts' },
        { key: 'Esc', action: 'Close modals' },
        { key: '⌘N / Ctrl+N', action: 'New chat' }
    ];

    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';
    shortcuts.forEach(shortcut => {
        html += `
            <div class="shortcut-item">
                <span style="font-size: 11px; color: var(--text-secondary);">${shortcut.action}</span>
                <span class="shortcut-key">${shortcut.key}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Active Query Status
 */
function showActiveQueryStatus(models) {
    const section = document.getElementById('activeQuerySection');
    const content = document.getElementById('activeQueryContent');

    if (!section || !content) return;

    section.style.display = 'block';

    let html = '';
    models.forEach(modelId => {
        const model = getModels().find(m => (m.id || m.ID) === modelId);
        const modelName = model ? (model.display_name || model.model_name || modelId) : modelId;
        html += `
            <div class="query-status-item">
                <span style="font-size: 11px;">${escapeHtml(modelName.substring(0, 20))}</span>
                <span class="query-status-indicator pending"></span>
            </div>
        `;
    });

    content.innerHTML = html;
}

function updateQueryStatus(modelId, status) {
    const content = document.getElementById('activeQueryContent');
    if (!content) return;

    const items = content.querySelectorAll('.query-status-item');
    items.forEach(item => {
        const text = item.textContent.trim();
        if (text.includes(modelId) || getModels().find(m => (m.id || m.ID) === modelId && text.includes(m.display_name || m.model_name))) {
            const indicator = item.querySelector('.query-status-indicator');
            if (indicator) {
                indicator.className = `query-status-indicator ${status}`;
            }
        }
    });
}

function hideActiveQueryStatus() {
    const section = document.getElementById('activeQuerySection');
    if (section) {
        section.style.display = 'none';
    }
}

/**
 * Get current results (helper)
 */
function getCurrentResults() {
    // Try to get from chat messages or results section
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        // Extract results from chat messages
        const results = {};
        // This would need to be implemented based on how results are stored
        return results;
    }

    // Try results section
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        // Extract from results section
        return {};
    }

    return null;
}

/**
 * Initialize all sidebar features
 */
function initializeSidebarFeatures() {
    // Check if right sidebar exists before initializing
    const rightSidebar = document.getElementById('rightSidebar');
    if (!rightSidebar) {
        // Right sidebar not loaded yet, defer initialization
        setTimeout(initializeSidebarFeatures, 500);
        return;
    }

    initializeSidebarSections();

    // Only update if elements exist
    if (document.getElementById('estimatedCost')) {
        updateCostTracker();
    }
    if (document.getElementById('queriesToday')) {
        updateSessionStats();
    }
    renderModelPerformance();
    renderFavorites();
    renderFilterPresets();
    renderPromptTemplates();
    renderActivityFeed();
    renderKeyboardShortcuts();

    // Watch for prompt changes to update recommendations
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        let recommendationTimeout;
        promptInput.addEventListener('input', () => {
            clearTimeout(recommendationTimeout);
            recommendationTimeout = setTimeout(() => {
                updateModelRecommendations();
            }, 500);
        });
    }

    // Watch for model selection changes
    subscribeStateChange(() => {
        updateCostTracker();
        if (typeof renderSelectedModelsDropdown === 'function') {
            renderSelectedModelsDropdown();
        }
    });

    // Periodic updates
    setInterval(() => {
        updateCostTracker();
        updateSessionStats();
        renderModelPerformance();
    }, 5000);
}

// Make functions globally available
window.toggleSection = toggleSection;
window.handleNewChat = handleNewChat;
window.handleClearSelection = handleClearSelection;
window.handleExportResults = handleExportResults;
window.handleCopyAllResponses = handleCopyAllResponses;
window.updateQuickTemp = updateQuickTemp;
window.updateQuickTokens = updateQuickTokens;
window.updateQuickStrategy = updateQuickStrategy;
window.updateQuickTask = updateQuickTask;
window.resetSessionStats = resetSessionStats;
window.saveCurrentAsFavorite = saveCurrentAsFavorite;
window.loadFavorite = loadFavorite;
window.saveCurrentFilterPreset = saveCurrentFilterPreset;
window.applyFilterPreset = applyFilterPreset;
window.deleteFilterPreset = deleteFilterPreset;
window.insertTemplate = insertTemplate;
window.selectRecommendedModel = selectRecommendedModel;
window.exportAsJSON = exportAsJSON;
window.exportAsMarkdown = exportAsMarkdown;
window.exportAsCSV = exportAsCSV;

// Initialize on load
document.addEventListener('DOMContentLoaded', function () {
    initializeSidebarFeatures();
});
