// Main Application Entry Point
// Initializes the application and handles query execution

/**
 * Initialize application on page load
 */
document.addEventListener('DOMContentLoaded', async function () {
    console.log('GAIOL Frontend Initializing...');

    // Initialize UI
    initializeUI();

    // Load models from API
    showLoading('Loading models...');
    try {
        await loadModelsFromAPI();
        // Only render if on models page
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'modelsPage') {
            renderModelSelection();
            renderFilterControls();
        }
        hideLoading();
        showToast('success', 'Models loaded', `Loaded ${getModels().length} models`);
    } catch (error) {
        hideLoading();
        showToast('error', 'Failed to load models', error.message);
    }

    // Subscribe to state changes
    subscribeStateChange((state) => {
        // Auto-update UI on state changes if needed
    });

    // Initialize selected models dropdown
    if (typeof renderSelectedModelsDropdown === 'function') {
        renderSelectedModelsDropdown();
    }

    // Initialize history sidebar
    renderHistory();

    // Update sidebar stats
    if (typeof updateSidebarStats === 'function') {
        updateSidebarStats();
    }

    console.log('GAIOL Frontend Ready');
});

/**
 * Execute multi-model comparison query
 */
async function executeCompareQuery() {
    const prompt = document.getElementById('promptInput')?.value.trim();
    const validation = validatePrompt(prompt);

    if (!validation.valid) {
        showToast('error', 'Validation Error', validation.error);
        return;
    }

    const selectedModels = getSelectedModels();
    const selectionValidation = validateModelSelection(selectedModels);

    if (!selectionValidation.valid) {
        showToast('error', 'Selection Error', selectionValidation.error);
        return;
    }

    // Get settings
    const maxTokens = parseInt(document.getElementById('maxTokensInput')?.value) || 200;
    const temperature = parseFloat(document.getElementById('temperatureInput')?.value) || 0.7;

    // Map model IDs to legacy names if needed
    const modelIds = selectedModels.map(id => {
        // Try to find legacy name mapping
        const model = getModels().find(m => m.id === id);
        if (model) {
            // Extract model name from ID (format: provider:model-name)
            const parts = id.split(':');
            return parts.length > 1 ? parts[1] : id;
        }
        return id;
    });

    showLoading(`Querying ${selectedModels.length} models...`);
    setUIState({ loading: true });

    // Show active query status
    if (typeof showActiveQueryStatus === 'function') {
        showActiveQueryStatus(selectedModels);
    }

    // Add activity
    if (typeof addActivityItem === 'function') {
        addActivityItem('query', `Querying ${selectedModels.length} models`);
    }

    const startTime = Date.now();
    try {
        const responses = await queryMultipleModels(prompt, modelIds, {
            max_tokens: maxTokens,
            temperature: temperature
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Transform responses
        const transformed = transformLegacyResponse(responses);

        // Update model performance
        Object.keys(transformed).forEach(modelId => {
            if (typeof updateModelPerformance === 'function') {
                updateModelPerformance(modelId, {
                    success: true,
                    responseTime: responseTime / Object.keys(transformed).length
                });
            }
        });

        // Update session stats
        if (typeof updateSessionStats === 'function') {
            const stats = getSessionStats();
            const tokens = Object.values(transformed).reduce((sum, r) => sum + (r.tokens_used || 0), 0);
            const cost = Object.values(transformed).reduce((sum, r) => sum + (r.cost || 0), 0);

            updateSessionStats({
                queriesCount: (stats.queriesCount || 0) + 1,
                tokensUsed: (stats.tokensUsed || 0) + tokens,
                totalCost: (stats.totalCost || 0) + cost,
                modelsUsedCount: new Set([...selectedModels, ...Object.keys(transformed)]).size,
                responseTimes: [...(stats.responseTimes || []), responseTime]
            });
        }

        // Save to history
        saveToHistory(prompt, transformed, {
            max_tokens: maxTokens,
            temperature: temperature
        });

        // Render results based on current page
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'chatPage') {
            renderResults(transformed, {
                prompt,
                mode: 'compare',
                models: selectedModels
            });
        } else {
            const resultsContainer = document.getElementById('resultsSection');
            if (resultsContainer) {
                renderResultsLegacy(transformed, {
                    prompt,
                    mode: 'compare',
                    models: selectedModels
                }, resultsContainer);
            }
        }

        hideLoading();
        if (typeof hideActiveQueryStatus === 'function') {
            hideActiveQueryStatus();
        }
        if (typeof updateCostTracker === 'function') {
            updateCostTracker();
        }
        if (typeof updateSessionStats === 'function') {
            updateSessionStats();
        }
        if (typeof renderModelPerformance === 'function') {
            renderModelPerformance();
        }
        showToast('success', 'Query completed', `Received responses from ${Object.keys(transformed).length} models`);
    } catch (error) {
        hideLoading();
        if (typeof hideActiveQueryStatus === 'function') {
            hideActiveQueryStatus();
        }
        // Update failed model performance
        selectedModels.forEach(modelId => {
            if (typeof updateModelPerformance === 'function') {
                updateModelPerformance(modelId, {
                    success: false,
                    responseTime: Date.now() - startTime
                });
            }
        });
        showError('Query failed', error.message);
    } finally {
        setUIState({ loading: false });
    }
}

/**
 * Execute smart routing query
 */
async function executeSmartQuery() {
    const prompt = document.getElementById('promptInput')?.value.trim();
    const validation = validatePrompt(prompt);

    if (!validation.valid) {
        showToast('error', 'Validation Error', validation.error);
        return;
    }

    // Get settings
    const maxTokens = parseInt(document.getElementById('maxTokensInput')?.value) || 200;
    const temperature = parseFloat(document.getElementById('temperatureInput')?.value) || 0.7;
    const strategy = document.getElementById('strategySelect')?.value || 'free_only';
    const task = document.getElementById('taskSelect')?.value || 'generate';

    showLoading('Selecting best model and querying...');
    setUIState({ loading: true });

    // Add activity
    if (typeof addActivityItem === 'function') {
        addActivityItem('query', 'Smart routing query');
    }

    const startTime = Date.now();
    try {
        const response = await queryWithSmartRouting(prompt, {
            strategy: strategy,
            task: task,
            max_tokens: maxTokens,
            temperature: temperature
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Transform UAIP response
        const transformed = transformUAIPResponse(response);

        // Create results object with model info
        const modelId = response.result?.model_used || 'unknown';
        const results = {
            [modelId]: transformed
        };

        // Update model performance
        if (typeof updateModelPerformance === 'function') {
            updateModelPerformance(modelId, {
                success: true,
                responseTime: responseTime
            });
        }

        // Update session stats
        if (typeof updateSessionStats === 'function') {
            const stats = getSessionStats();
            const tokens = transformed.tokens_used || 0;
            const cost = transformed.cost || 0;

            updateSessionStats({
                queriesCount: (stats.queriesCount || 0) + 1,
                tokensUsed: (stats.tokensUsed || 0) + tokens,
                totalCost: (stats.totalCost || 0) + cost,
                modelsUsedCount: new Set([...Object.keys(results)]).size,
                responseTimes: [...(stats.responseTimes || []), responseTime]
            });
        }

        // Save to history
        saveToHistory(prompt, results, {
            strategy: strategy,
            task: task,
            max_tokens: maxTokens,
            temperature: temperature
        });

        // Render results based on current page
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'chatPage') {
            renderResults(results, {
                prompt,
                mode: 'smart',
                strategy: strategy,
                task: task,
                selectedModel: modelId
            });
        } else {
            const resultsContainer = document.getElementById('resultsSection');
            if (resultsContainer) {
                renderResultsLegacy(results, {
                    prompt,
                    mode: 'smart',
                    strategy: strategy,
                    task: task,
                    selectedModel: modelId
                }, resultsContainer);
            }
        }

        hideLoading();
        if (typeof updateCostTracker === 'function') {
            updateCostTracker();
        }
        if (typeof updateSessionStats === 'function') {
            updateSessionStats();
        }
        if (typeof renderModelPerformance === 'function') {
            renderModelPerformance();
        }
        showToast('success', 'Smart query completed', `Selected: ${transformed.model}`);
    } catch (error) {
        hideLoading();
        showError('Smart query failed', error.message);
    } finally {
        setUIState({ loading: false });
    }
}

/**
 * Execute single model query
 */
async function executeSingleQuery() {
    const prompt = document.getElementById('promptInput')?.value.trim();
    const validation = validatePrompt(prompt);

    if (!validation.valid) {
        showToast('error', 'Validation Error', validation.error);
        return;
    }

    const modelId = document.getElementById('singleModelSelect')?.value;
    if (!modelId) {
        showToast('error', 'Selection Error', 'Please select a model');
        return;
    }

    // Get settings
    const maxTokens = parseInt(document.getElementById('maxTokensInput')?.value) || 200;
    const temperature = parseFloat(document.getElementById('temperatureInput')?.value) || 0.7;

    showLoading('Querying model...');
    setUIState({ loading: true });

    // Add activity
    if (typeof addActivityItem === 'function') {
        addActivityItem('query', `Querying ${modelId}`);
    }

    const startTime = Date.now();
    try {
        const response = await querySpecificModel(prompt, modelId, {
            max_tokens: maxTokens,
            temperature: temperature
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Transform UAIP response
        const transformed = transformUAIPResponse(response);

        // Create results object
        const results = {
            [modelId]: transformed
        };

        // Update model performance
        if (typeof updateModelPerformance === 'function') {
            updateModelPerformance(modelId, {
                success: true,
                responseTime: responseTime
            });
        }

        // Update session stats
        if (typeof updateSessionStats === 'function') {
            const stats = getSessionStats();
            const tokens = transformed.tokens_used || 0;
            const cost = transformed.cost || 0;

            updateSessionStats({
                queriesCount: (stats.queriesCount || 0) + 1,
                tokensUsed: (stats.tokensUsed || 0) + tokens,
                totalCost: (stats.totalCost || 0) + cost,
                modelsUsedCount: new Set([modelId]).size,
                responseTimes: [...(stats.responseTimes || []), responseTime]
            });
        }

        // Save to history
        saveToHistory(prompt, results, {
            model_id: modelId,
            max_tokens: maxTokens,
            temperature: temperature
        });

        // Render results based on current page
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'chatPage') {
            renderResults(results, {
                prompt,
                mode: 'single',
                model: modelId
            });
        } else {
            const resultsContainer = document.getElementById('resultsSection');
            if (resultsContainer) {
                renderResultsLegacy(results, {
                    prompt,
                    mode: 'single',
                    model: modelId
                }, resultsContainer);
            }
        }

        hideLoading();
        if (typeof updateCostTracker === 'function') {
            updateCostTracker();
        }
        if (typeof updateSessionStats === 'function') {
            updateSessionStats();
        }
        if (typeof renderModelPerformance === 'function') {
            renderModelPerformance();
        }
        showToast('success', 'Query completed', `Response from ${transformed.model}`);
    } catch (error) {
        hideLoading();
        // Update failed model performance
        if (typeof updateModelPerformance === 'function') {
            updateModelPerformance(modelId, {
                success: false,
                responseTime: Date.now() - startTime
            });
        }
        showError('Query failed', error.message);
    } finally {
        setUIState({ loading: false });
    }
}

/**
 * Toggle Reasoning Mode
 */
function toggleReasoningMode() {
    const state = getUIState();
    const newMode = !state.reasoningMode;
    setUIState({ reasoningMode: newMode });

    const btn = document.getElementById('reasoningToggle');
    if (btn) {
        btn.classList.toggle('active', newMode);
        btn.title = newMode ? 'Disable Reasoning Mode' : 'Enable Reasoning Mode';
    }

    showToast('info', `Reasoning Mode ${newMode ? 'Enabled' : 'Disabled'}`);
}

/**
 * Intelligent Model Selector for Reasoning Engine
 * Dynamically analyzes available models and selects optimal ones based on task type
 */
function selectModelsForReasoning(prompt) {
    const availableModels = getModels();

    if (!availableModels || availableModels.length === 0) {
        console.warn('No models available for selection');
        return {
            models: [],
            taskType: 'general',
            reasoning: 'No models available'
        };
    }

    // Categorize available models by their capabilities
    const categorizedModels = {
        coding: [],
        creative: [],
        analysis: [],
        math: [],
        summarize: [],
        general: []
    };

    // Analyze each model's tags and metadata to categorize it
    availableModels.forEach(model => {
        const modelId = model.id || model.ID;
        const tags = (model.tags || model.Tags || []).map(t => t.toLowerCase());
        const description = (model.description || model.Description || '').toLowerCase();
        const name = (model.display_name || model.DisplayName || modelId).toLowerCase();
        const combinedText = `${tags.join(' ')} ${description} ${name}`;

        // Categorize based on tags and capabilities
        if (combinedText.match(/\b(code|coding|programming|developer|function|api)\b/)) {
            categorizedModels.coding.push(modelId);
        }
        if (combinedText.match(/\b(creative|writing|story|narrative|composition|literary)\b/)) {
            categorizedModels.creative.push(modelId);
        }
        if (combinedText.match(/\b(analysis|research|reasoning|logic|thinking|problem-solving)\b/)) {
            categorizedModels.analysis.push(modelId);
        }
        if (combinedText.match(/\b(math|mathematical|calculation|equation|quantitative)\b/)) {
            categorizedModels.math.push(modelId);
        }
        if (combinedText.match(/\b(summarize|summary|extract|condensation|tldr)\b/)) {
            categorizedModels.summarize.push(modelId);
        }

        // All models can be used for general tasks
        categorizedModels.general.push(modelId);
    });

    // Task detection patterns (same as before)
    const taskPatterns = {
        coding: /\b(code|program|function|algorithm|debug|script|api|database|sql|python|javascript|java|c\+\+|implement|develop)\b/i,
        creative: /\b(write|story|poem|creative|narrative|character|plot|fiction|essay|article|blog)\b/i,
        analysis: /\b(analyz|research|compare|evaluate|assess|study|investigate|examine|review|critique)\b/i,
        math: /\b(calculate|solve|equation|formula|proof|theorem|mathematical|statistics|probability|optimization)\b/i,
        summarize: /\b(summarize|summary|extract|key points|main ideas|tldr|condense|brief)\b/i
    };

    // Detect task type from prompt
    let taskType = 'general';
    let maxScore = 0;

    for (const [type, pattern] of Object.entries(taskPatterns)) {
        const matches = (prompt.match(pattern) || []).length;
        if (matches > maxScore) {
            maxScore = matches;
            taskType = type;
        }
    }

    // Get models for the detected task type
    let candidateModels = categorizedModels[taskType] || [];

    // If no specialized models, fall back to general
    if (candidateModels.length === 0) {
        candidateModels = categorizedModels.general;
        taskType = 'general';
    }

    // Rank models by quality indicators (prefer models with "gpt-4", "claude", "gemini", etc. in name)
    const qualityKeywords = ['gpt-4', 'claude-3', 'gemini-1.5', 'llama-3', 'mistral', 'qwen'];

    const rankedModels = candidateModels.sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();

        // Count quality keyword matches
        const aScore = qualityKeywords.reduce((score, kw) => score + (aLower.includes(kw) ? 1 : 0), 0);
        const bScore = qualityKeywords.reduce((score, kw) => score + (bLower.includes(kw) ? 1 : 0), 0);

        return bScore - aScore; // Higher score first
    });

    // Select top 3-4 models
    const selectedModels = rankedModels.slice(0, Math.min(4, rankedModels.length));

    // If we have fewer than 3, pad with general models
    if (selectedModels.length < 3) {
        const generalModels = categorizedModels.general.filter(m => !selectedModels.includes(m));
        selectedModels.push(...generalModels.slice(0, 3 - selectedModels.length));
    }

    return {
        models: selectedModels,
        taskType: taskType,
        reasoning: selectedModels.length > 0
            ? `Selected ${selectedModels.length} models optimized for ${taskType} tasks`
            : 'No suitable models found'
    };
}

/**
 * Execute Reasoning Engine query
 */
async function executeReasoningQuery() {
    const prompt = document.getElementById('promptInput')?.value.trim();
    const validation = validatePrompt(prompt);

    if (!validation.valid) {
        showToast('error', 'Validation Error', validation.error);
        return;
    }

    const selectedModels = getSelectedModels();

    // Intelligent model selection
    let modelIds;
    let selectionReasoning = '';

    if (selectedModels.length > 0) {
        // User has manually selected models - respect their choice
        modelIds = selectedModels;
        selectionReasoning = `Using ${selectedModels.length} user-selected models`;
    } else {
        // AI-powered model recommendation based on prompt analysis
        const recommendation = selectModelsForReasoning(prompt);
        modelIds = recommendation.models;
        selectionReasoning = recommendation.reasoning;

        // Show toast to inform user about auto-selection
        showToast('info', 'Smart Model Selection',
            `${selectionReasoning} (${recommendation.taskType})`);
    }


    // Setup Chat UI for reasoning
    const chatMessages = document.getElementById('chatMessages');
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) welcomeSection.style.display = 'none';

    // 1. Add User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerHTML = `<div class="chat-message-content">${escapeHtml(prompt)}</div>`;
    chatMessages.appendChild(userMsg);

    // 2. Add Assistant Message with Reasoning Container
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'chat-message assistant glass-panel';
    const reasoningId = `reasoning-${Date.now()}`;
    const contentId = `content-${Date.now()}`;

    assistantMsg.innerHTML = `
        <div class="chat-message-header">Reasoning Engine</div>
        <div id="${reasoningId}"></div>
        <div id="${contentId}" class="chat-message-content" style="opacity: 0.5;">Awaiting final output...</div>
    `;
    chatMessages.appendChild(assistantMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // 3. Initialize Reasoning Component
    const component = new ReasoningComponent(reasoningId, null);

    // 4. Start Reasoning Engine
    try {
        setUIState({ loading: true });
        ReasoningEngine.onEvent((event) => {
            component.onEvent(event);

            // If reasoning is complete, the final output will be in reasoning_end or similar
            // Actually, the final assembled output comes from the Engine.
            // But we can also look for a specific event 'final_output'
            if (event.type === 'reasoning_end') {
                const contentBody = document.getElementById(contentId);
                if (contentBody) {
                    contentBody.textContent = event.payload.final_output;
                    contentBody.style.opacity = '1';

                    // Save to history
                    const results = { 'ReasoningEngine': { response: event.payload.final_output, success: true } };
                    saveToHistory(prompt, results, { mode: 'reasoning' });
                }
                setUIState({ loading: false });
            }
        });

        await ReasoningEngine.start(prompt, modelIds);
    } catch (error) {
        showError('Reasoning failed', error.message);
        setUIState({ loading: false });
    }
}

/**
 * Handle query submission based on current mode
 */
function handleQuerySubmit() {
    // Check authentication before allowing queries
    if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
        showToast('warning', 'Authentication Required', 'Please sign in to use AI models');
        if (typeof switchPage === 'function') {
            switchPage('login');
        }
        return;
    }

    const uiState = getUIState();

    // If Reasoning Mode is ON, intercept and use reasoning flow
    if (uiState.reasoningMode) {
        executeReasoningQuery();
        return;
    }

    const queryMode = uiState.queryMode;

    switch (queryMode) {
        case 'compare':
            executeCompareQuery();
            break;
        case 'smart':
            executeSmartQuery();
            break;
        case 'single':
            executeSingleQuery();
            break;
        default:
            showToast('error', 'Invalid mode', 'Please select a query mode');
    }
}

/**
 * Clear form
 */
function clearForm() {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = '';
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(promptInput);
        }
    }

    updateCharCount();
    clearSelectedModels();

    // Clear chat messages
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }

    // Show welcome section again
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'block';
    }

    // Clear results section (for compare page)
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        resultsSection.innerHTML = '';
        resultsSection.classList.remove('active');
    }

    showToast('info', 'Form cleared');
}

// Make functions globally available
window.executeCompareQuery = executeCompareQuery;
window.executeSmartQuery = executeSmartQuery;
window.executeSingleQuery = executeSingleQuery;
window.handleQuerySubmit = handleQuerySubmit;
window.clearForm = clearForm;
window.setQueryMode = setQueryMode;
window.toggleModelSelectionUI = toggleModelSelectionUI;
window.toggleModelSelection = function (modelId) {
    toggleModelSelectionUI(modelId);
};
window.handleModelCardClick = function (modelId) {
    toggleModelSelectionUI(modelId);
};
window.toggleReasoningMode = toggleReasoningMode;
window.executeReasoningQuery = executeReasoningQuery;
window.selectAllModels = selectAllModels;
window.deselectAllModels = deselectAllModels;
window.selectAllFreeModels = selectAllFreeModels;
window.toggleHistorySidebar = toggleHistorySidebar;
window.replayQuery = replayQuery;
window.deleteHistoryItem = deleteHistoryItem;
window.clearAllHistory = clearAllHistory;
window.exportHistory = exportHistory;
window.loadMoreHistoryItems = loadMoreHistoryItems;
window.copyResponse = copyResponse;
window.toggleExpand = toggleExpand;
window.toggleChatMessage = toggleChatMessage;
window.sortResults = sortResults;
window.expandAllResults = expandAllResults;
window.collapseAllResults = collapseAllResults;
window.clearFilters = clearFilters;
window.toggleTagFilter = toggleTagFilter;
window.toggleSettingsPanel = toggleSettingsPanel;
window.resetSettings = resetSettings;
window.updateCharCount = updateCharCount;
window.autoResizeTextarea = autoResizeTextarea;
window.renderResultsLegacy = renderResultsLegacy;
window.escapeHtml = escapeHtml;