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
 * Execute comparison query (Deprecated - redirected to unified reasoning path)
 */
async function executeCompareQuery() {
    showToast('info', 'Unified Mode', 'All queries now use the unified reasoning engine.');
    handleQuerySubmit();
}

/**
 * Execute smart routing query
 */
/**
 * Execute smart routing query (Deprecated - redirected to unified reasoning path)
 */
async function executeSmartQuery() {
    handleQuerySubmit();
}

/**
 * Execute single model query (REMOVED - use automatic smart routing instead)
 * @deprecated Use executeSmartQuery() for automatic model selection
 */
async function executeSingleQuery() {
    // This function has been removed - all queries now use automatic model selection
    showToast('info', 'Automatic Mode', 'Model selection is now automatic. Use smart routing instead.');
    executeSmartQuery();
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

        // Refresh history display
        if (typeof renderHistory === 'function') {
            renderHistory();
        }

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
        const errorMsg = error.message || 'Query failed';

        // Handle authentication errors specially
        if (errorMsg.includes('Authentication required') || errorMsg.includes('Please sign in')) {
            showToast('warning', 'Authentication Required', 'Please sign in to use AI models');
            if (typeof switchPage === 'function') {
                switchPage('login');
            }
        } else {
            showError('Query failed', errorMsg);
        }
    } finally {
        setUIState({ loading: false });
    }
}

/**
 * Toggle Reasoning Mode
 */
/**
 * Toggle Reasoning Mode (Deprecated - Reasoning is always ON)
 */
function toggleReasoningMode() {
    showToast('info', 'Reasoning mode is now the default and cannot be disabled.');
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

    // Always use automatic model selection - backend will choose best models
    const modelIds = []; // Empty array = backend auto-selects


    // Setup Chat UI for reasoning
    const chatMessages = document.getElementById('chatMessages');
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'none';
        if (chatMessages) chatMessages.style.display = 'flex';
    }

    // 1. Add User Message
    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.innerHTML = `
        <div class="chat-message-header">You</div>
        <div class="chat-message-bubble">
            <div class="chat-message-content">${escapeHtml(prompt)}</div>
        </div>
    `;
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

        // Beam search and consensus are enabled by default on the backend
        // The backend automatically selects models and breaks down the prompt

        ReasoningEngine.onEvent((event) => {
            component.onEvent(event);

            // Add status rows for major events
            if (event.type === 'decompose_start') {
                addChatStatusRow('Decomposing prompt into logical steps...', 'loading');
            } else if (event.type === 'decompose_end') {
                addChatStatusRow(`Analysis complete: ${event.payload.steps.length} steps identified`);
            }

            // If reasoning is complete, the final output will be in reasoning_end or similar
            // Actually, the final assembled output comes from the Engine.
            // But we can also look for a specific event 'final_output'
            if (event.type === 'reasoning_end') {
                addChatStatusRow('Reasoning complete. Best path selected.');
                const contentBody = document.getElementById(contentId);
                if (contentBody) {
                    contentBody.textContent = event.payload.final_output;
                    contentBody.style.opacity = '1';

                    // Save to history
                    const results = { 'ReasoningEngine': { response: event.payload.final_output, success: true } };
                    saveToHistory(prompt, results, { mode: 'reasoning' });

                    // Refresh history display
                    if (typeof renderHistory === 'function') {
                        renderHistory();
                    }
                }
                setUIState({ loading: false });
                if (typeof clearChatStatus === 'function') {
                    clearChatStatus();
                }
            }
        });

        // Start reasoning - backend handles beam search and consensus automatically
        await ReasoningEngine.start(prompt, modelIds, {
            beam: {
                enabled: true,  // Beam search enabled by default
                beam_width: 3   // Explore 3 paths per step
            }
        });
    } catch (error) {
        const errorMsg = error.message || 'Reasoning failed';

        // Handle authentication errors specially
        if (errorMsg.includes('Authentication required') || errorMsg.includes('Please sign in')) {
            showToast('warning', 'Authentication Required', 'Please sign in to use AI models');
            if (typeof switchPage === 'function') {
                switchPage('login');
            }
        } else {
            showError('Reasoning failed', errorMsg);
        }
        setUIState({ loading: false });
        if (typeof showChatStatus === 'function') {
            showChatStatus('error', errorMsg);
        }
    }
}

/**
 * Handle query submission - always uses automatic smart routing
 */
/**
 * Handle query submission - always uses the Reasoning Engine
 */
function handleQuerySubmit() {
    // All queries now go through the reasoning flow
    executeReasoningQuery();
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
    if (typeof clearChatStatus === 'function') {
        clearChatStatus();
    }

    // Show welcome section again
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'flex';
        if (chatMessages) chatMessages.style.display = 'none';
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