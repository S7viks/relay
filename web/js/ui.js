// UI Rendering Module
// Handles all UI rendering and user interactions

/**
 * Initialize UI on page load
 */
function initializeUI() {
    setupEventListeners();
    setupHealthCheck();

    // Initialize page-specific content based on active page
    setTimeout(() => {
        const currentPage = document.querySelector('.page.active')?.id;
        if (currentPage === 'modelsPage') {
            renderFilterControls();
            renderModelSelection();
        } else if (currentPage === 'comparePage') {
            renderQueryModeSelector();
            renderQuerySettings();
        } else if (currentPage === 'historyPage') {
            if (typeof renderHistory === 'function') {
                renderHistory();
            }
        }
    }, 100);
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Prompt input character counter and auto-resize
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.addEventListener('input', () => {
            updateCharCount();
            autoResizeTextarea(promptInput);
        });
        // Initial resize
        autoResizeTextarea(promptInput);
    }

    // Filter controls
    const providerFilter = document.getElementById('providerFilter');
    if (providerFilter) {
        providerFilter.addEventListener('change', handleFilterChange);
    }

    const costFilter = document.getElementById('costFilter');
    if (costFilter) {
        costFilter.addEventListener('change', handleFilterChange);
    }

    const searchInput = document.getElementById('modelSearch');
    if (searchInput) {
        const debouncedSearch = debounce(handleFilterChange, 300);
        searchInput.addEventListener('input', debouncedSearch);
    }

    // Settings
    const maxTokensInput = document.getElementById('maxTokensInput');
    if (maxTokensInput) {
        maxTokensInput.addEventListener('input', updateMaxTokensDisplay);
    }

    const maxTokensSlider = document.getElementById('maxTokensSlider');
    if (maxTokensSlider) {
        maxTokensSlider.addEventListener('input', (e) => {
            if (maxTokensInput) maxTokensInput.value = e.target.value;
            updateMaxTokensDisplay();
        });
    }

    const tempInput = document.getElementById('temperatureInput');
    if (tempInput) {
        tempInput.addEventListener('input', updateTemperatureDisplay);
    }

    const tempSlider = document.getElementById('temperatureSlider');
    if (tempSlider) {
        tempSlider.addEventListener('input', (e) => {
            if (tempInput) tempInput.value = e.target.value;
            updateTemperatureDisplay();
        });
    }
}

/**
 * Render query mode selector
 */
function renderQueryModeSelector() {
    const container = document.getElementById('queryModeSelector');
    if (!container) return;

    const modes = [
        { 
            id: 'compare', 
            label: 'Compare Models', 
            icon: '⚡',
            description: 'Query multiple selected models and compare their responses side-by-side'
        },
        { 
            id: 'smart', 
            label: 'Smart Query', 
            icon: '🤖',
            description: 'Let the system automatically select the best model for your query'
        },
        { 
            id: 'single', 
            label: 'Single Model', 
            icon: '🎯',
            description: 'Query a single specific model for focused results'
        }
    ];

    const currentMode = getUIState().queryMode || 'compare';
    container.className = 'query-mode-selector-redesigned';
    container.innerHTML = modes.map(mode => `
        <button class="query-mode-btn-redesigned ${currentMode === mode.id ? 'active' : ''}" 
                onclick="setQueryMode('${mode.id}')">
            <div class="query-mode-icon">${mode.icon}</div>
            <div class="query-mode-label">${escapeHtml(mode.label)}</div>
            <div class="query-mode-description">${escapeHtml(mode.description)}</div>
        </button>
    `).join('');
}

/**
 * Set query mode
 */
function setQueryMode(mode) {
    setUIState({ queryMode: mode });
    renderQueryModeSelector();
    renderModelSelection();
    renderQuerySettings();

    // Update button text based on mode
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        const labels = {
            'compare': '⚡ Query Selected Models',
            'smart': '🤖 Smart Query',
            'single': '🎯 Query Model'
        };
        submitBtn.textContent = labels[mode] || '⚡ Query';
    }
}

/**
 * Render filter controls
 */
function renderFilterControls() {
    const container = document.getElementById('filterControls');
    if (!container) return;

    const models = getModels();
    const providers = getAllProviders(models);
    const tags = getAllTags(models);
    const filters = getFilters();

    let html = `
        <div class="filter-section">
            <label class="filter-section-label">Provider</label>
            <div class="filter-options-redesigned">
                <button class="filter-option-btn ${!filters.provider || filters.provider === 'all' ? 'active' : ''}" 
                        data-filter-type="provider" data-value="all">
                    All Providers
                </button>
                ${providers.map(provider => `
                    <button class="filter-option-btn ${filters.provider === provider ? 'active' : ''}" 
                            data-filter-type="provider" data-value="${provider}">
                        ${escapeHtml(getProviderDisplayName(provider))}
                    </button>
                `).join('')}
            </div>
        </div>

        <div class="filter-section">
            <label class="filter-section-label">Cost</label>
            <div class="filter-options-redesigned">
                <button class="filter-option-btn ${!filters.cost || filters.cost === 'all' ? 'active' : ''}" 
                        data-filter-type="cost" data-value="all">
                    All Types
                </button>
                <button class="filter-option-btn ${filters.cost === 'free' ? 'active' : ''}" 
                        data-filter-type="cost" data-value="free">
                    🆓 Free
                </button>
                <button class="filter-option-btn ${filters.cost === 'premium' ? 'active' : ''}" 
                        data-filter-type="cost" data-value="premium">
                    💎 Premium
                </button>
            </div>
        </div>

        ${tags.length > 0 ? `
        <div class="filter-section">
            <label class="filter-section-label">Capabilities</label>
            <div class="filter-tags-redesigned">
                ${tags.map(tag => `
                    <button class="filter-tag-btn ${filters.tags && filters.tags.includes(tag) ? 'active' : ''}" 
                            data-tag="${tag}">
                        ${escapeHtml(tag)}
                    </button>
                `).join('')}
            </div>
        </div>
        ` : ''}

        <div class="filter-actions">
            <button class="btn-filter-clear" onclick="clearFilters()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                Clear Filters
            </button>
        </div>
    `;

    container.innerHTML = html;

    // Add event listeners
    container.querySelectorAll('.filter-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.filterType;
            const value = btn.dataset.value;
            const filters = getFilters();
            setFilters({ ...filters, [type]: value });
            renderFilterControls();
            renderModelSelection();
        });
    });

    container.querySelectorAll('.filter-tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleTagFilter(btn.dataset.tag);
            renderFilterControls();
            renderModelSelection();
        });
    });
}

/**
 * Handle filter change
 */
function handleFilterChange() {
    renderModelSelection();
}

/**
 * Toggle tag filter
 */
function toggleTagFilter(tag) {
    const filters = getFilters();
    const tags = filters.tags || [];
    const index = tags.indexOf(tag);

    if (index > -1) {
        tags.splice(index, 1);
    } else {
        tags.push(tag);
    }

    setFilters({ ...filters, tags });
    renderModelSelection();
}

/**
 * Clear all filters
 */
function clearFilters() {
    setFilters({
        provider: 'all',
        cost: 'all',
        tags: [],
        search: '',
        task: 'all'
    });
    
    // Clear search input
    const searchInput = document.getElementById('modelsSearchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    if (searchInput) {
        searchInput.value = '';
    }
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
    
    renderFilterControls();
    renderModelSelection();
    showToast('info', 'Filters cleared');
}

/**
 * Render model selection grid
 */
function renderModelSelection() {
    const container = document.getElementById('modelGridContainer');
    if (!container) return;

    const models = getModels();
    const filters = getFilters();
    const selectedModelIds = getSelectedModels();

    // Apply search filter from search input
    const searchInput = document.getElementById('modelsSearchInput');
    if (searchInput && searchInput.value.trim()) {
        filters.search = searchInput.value.trim();
    }

    const filteredModels = filterModels(models, filters);

    // Update metrics
    const totalCountEl = document.getElementById('totalModelsCount');
    const selectedCountEl = document.getElementById('selectedModelsCount');
    const providersCountEl = document.getElementById('totalProvidersCount');
    const filteredCountEl = document.getElementById('filteredResultsCount');
    const bulkActionsEl = document.getElementById('modelsBulkActions');
    const bulkCountEl = document.getElementById('bulkSelectionCount');

    if (totalCountEl) totalCountEl.textContent = models.length;
    if (selectedCountEl) selectedCountEl.textContent = selectedModelIds.length;
    if (providersCountEl) providersCountEl.textContent = new Set(models.map(m => m.provider || m.Provider || 'unknown')).size;
    if (filteredCountEl) filteredCountEl.textContent = `${filteredModels.length} model${filteredModels.length !== 1 ? 's' : ''}`;
    
    // Show/hide bulk actions
    if (bulkActionsEl) {
        if (selectedModelIds.length > 0) {
            bulkActionsEl.style.display = 'flex';
            if (bulkCountEl) bulkCountEl.textContent = `${selectedModelIds.length} model${selectedModelIds.length !== 1 ? 's' : ''} selected`;
        } else {
            bulkActionsEl.style.display = 'none';
        }
    }

    if (filteredModels.length === 0) {
        container.innerHTML = `
            <div class="models-empty-state">
                <div class="models-empty-icon">🔍</div>
                <h3 class="models-empty-title">No models found</h3>
                <p class="models-empty-description">Try adjusting your search or filters to find what you're looking for.</p>
                <div class="models-empty-action">
                    <button class="btn-secondary" onclick="clearFilters(); const input = document.getElementById('modelsSearchInput'); if(input) input.value = ''; renderModelSelection();">Clear All Filters</button>
                </div>
            </div>
        `;
        return;
    }

    // Get current view mode
    const currentView = container.classList.contains('list-view') ? 'list' : 'grid';
    const viewClass = currentView === 'list' ? 'list-view' : '';

    container.innerHTML = filteredModels.map(model => {
        const modelId = model.id || model.ID;
        const displayName = model.display_name || model.DisplayName || modelId;
        const provider = model.provider || model.Provider || 'unknown';
        const isSelected = selectedModelIds.includes(modelId);
        const description = model.description || model.Description || 'High-performance AI model for various tasks.';
        const tags = model.tags || model.Tags || [];
        const isFree = isModelFree(model);
        const costInfo = model.cost_info || model.CostInfo || {};
        const qualityScore = model.quality_score || model.QualityScore || 0;

        return `
            <div class="model-card-redesigned ${viewClass} ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation(); toggleModelSelectionUI('${modelId}')">
                <div class="model-card-header-redesigned">
                    <div class="model-card-title-section">
                        <h3 class="model-card-title">${escapeHtml(displayName)}</h3>
                        <code class="model-card-id">${escapeHtml(modelId)}</code>
                    </div>
                    <div class="model-card-checkbox-wrapper">
                        <input type="checkbox" class="model-card-checkbox" ${isSelected ? 'checked' : ''} 
                               onclick="event.stopPropagation(); toggleModelSelectionUI('${modelId}')">
                    </div>
                </div>
                <div class="model-card-body">
                    <div class="model-card-provider">${escapeHtml(getProviderDisplayName(provider))}</div>
                    <p class="model-card-description">${escapeHtml(description.length > 150 ? description.substring(0, 150) + '...' : description)}</p>
                    ${tags.length > 0 ? `
                        <div class="model-card-tags">
                            ${tags.slice(0, 4).map(tag => `<span class="model-card-tag">${escapeHtml(tag)}</span>`).join('')}
                            ${tags.length > 4 ? `<span class="model-card-tag">+${tags.length - 4}</span>` : ''}
                        </div>
                    ` : ''}
                </div>
                <div class="model-card-footer">
                    <div class="model-card-cost ${isFree ? 'free' : 'premium'}">
                        ${isFree ? '🆓 Free' : '💎 Premium'}
                    </div>
                    <div class="model-card-metrics">
                        ${qualityScore > 0 ? `
                            <div class="model-metric-item" title="Quality Score">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                                </svg>
                                <span>${qualityScore.toFixed(1)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Handle model card click
 */
function handleModelCardClick(modelId) {
    toggleModelSelectionUI(modelId);
}

/**
 * Toggle model selection (UI wrapper)
 */
function toggleModelSelectionUI(modelId) {
    if (!modelId) return;

    const selected = getSelectedModels();
    const index = selected.indexOf(modelId);
    if (index > -1) {
        selected.splice(index, 1);
    } else {
        selected.push(modelId);
    }
    setSelectedModels(selected);
    renderModelSelection();

    // Show feedback
    const count = selected.length;
    if (count > 0) {
        showToast('info', `${count} model${count > 1 ? 's' : ''} selected`);
    }
}

/**
 * Render query settings panel
 */
function renderQuerySettings() {
    const container = document.getElementById('querySettings');
    if (!container) return;

    const settings = getSettings();
    const queryMode = getUIState().queryMode;

    container.className = 'query-settings-redesigned';
    
    let html = `
        <div class="setting-group-redesigned">
            <label class="setting-group-label">
                Max Tokens
                <span class="setting-group-value" id="maxTokensValue">${settings.defaultMaxTokens || 200}</span>
            </label>
            <div class="setting-input-group">
                <input type="range" id="maxTokensSlider" class="setting-slider" min="50" max="4096" value="${settings.defaultMaxTokens || 200}" step="50">
                <input type="number" id="maxTokensInput" class="setting-number-input" min="50" max="4096" value="${settings.defaultMaxTokens || 200}">
            </div>
        </div>
        <div class="setting-group-redesigned">
            <label class="setting-group-label">
                Temperature
                <span class="setting-group-value" id="temperatureValue">${settings.defaultTemperature || 0.7}</span>
            </label>
            <div class="setting-input-group">
                <input type="range" id="temperatureSlider" class="setting-slider" min="0" max="2" value="${settings.defaultTemperature || 0.7}" step="0.1">
                <input type="number" id="temperatureInput" class="setting-number-input" min="0" max="2" value="${settings.defaultTemperature || 0.7}" step="0.1">
            </div>
        </div>
    `;

    // Smart routing settings (only in smart mode)
    if (queryMode === 'smart') {
        html += `
            <div class="setting-group-redesigned">
                <label class="setting-group-label">Strategy</label>
                <select id="strategySelect" class="setting-select">
                    <option value="free_only" ${settings.defaultStrategy === 'free_only' ? 'selected' : ''}>Free Only</option>
                    <option value="lowest_cost" ${settings.defaultStrategy === 'lowest_cost' ? 'selected' : ''}>Lowest Cost</option>
                    <option value="highest_quality" ${settings.defaultStrategy === 'highest_quality' ? 'selected' : ''}>Highest Quality</option>
                    <option value="balanced" ${settings.defaultStrategy === 'balanced' ? 'selected' : ''}>Balanced</option>
                </select>
            </div>
            <div class="setting-group-redesigned">
                <label class="setting-group-label">Task Type</label>
                <select id="taskSelect" class="setting-select">
                    <option value="generate" ${settings.defaultTask === 'generate' ? 'selected' : ''}>Generate</option>
                    <option value="analyze" ${settings.defaultTask === 'analyze' ? 'selected' : ''}>Analyze</option>
                    <option value="summarize" ${settings.defaultTask === 'summarize' ? 'selected' : ''}>Summarize</option>
                    <option value="code" ${settings.defaultTask === 'code' ? 'selected' : ''}>Code</option>
                    <option value="transform" ${settings.defaultTask === 'transform' ? 'selected' : ''}>Transform</option>
                    <option value="classify" ${settings.defaultTask === 'classify' ? 'selected' : ''}>Classify</option>
                    <option value="vision" ${settings.defaultTask === 'vision' ? 'selected' : ''}>Vision</option>
                </select>
            </div>
        `;
    }

    // Single model selector (only in single mode)
    if (queryMode === 'single') {
        const models = getModels();
        html += `
            <div class="setting-group-redesigned">
                <label class="setting-group-label">Select Model</label>
                <select id="singleModelSelect" class="setting-select">
                    <option value="">Choose a model...</option>
                    ${models.map(m => `<option value="${m.id || m.ID}">${escapeHtml(m.display_name || m.DisplayName || m.model_name || m.ModelName || m.id || m.ID)}</option>`).join('')}
                </select>
            </div>
        `;
    }

    container.innerHTML = html;
    updateMaxTokensDisplay();
    updateTemperatureDisplay();
    
    // Add event listeners
    const maxTokensSlider = document.getElementById('maxTokensSlider');
    const maxTokensInput = document.getElementById('maxTokensInput');
    const tempSlider = document.getElementById('temperatureSlider');
    const tempInput = document.getElementById('temperatureInput');
    
    if (maxTokensSlider && maxTokensInput) {
        maxTokensSlider.addEventListener('input', () => {
            maxTokensInput.value = maxTokensSlider.value;
            updateMaxTokensDisplay();
        });
        maxTokensInput.addEventListener('input', () => {
            maxTokensSlider.value = maxTokensInput.value;
            updateMaxTokensDisplay();
        });
    }
    
    if (tempSlider && tempInput) {
        tempSlider.addEventListener('input', () => {
            tempInput.value = tempSlider.value;
            updateTemperatureDisplay();
        });
        tempInput.addEventListener('input', () => {
            tempSlider.value = tempInput.value;
            updateTemperatureDisplay();
        });
    }
}

/**
 * Toggle settings panel
 */
function toggleSettingsPanel() {
    const content = document.getElementById('settingsContent');
    const toggle = document.getElementById('settingsToggle');
    if (content && toggle) {
        content.style.display = content.style.display === 'none' ? 'grid' : 'none';
        toggle.textContent = content.style.display === 'none' ? '▼' : '▲';
    }
}

/**
 * Update max tokens display
 */
function updateMaxTokensDisplay() {
    const slider = document.getElementById('maxTokensSlider');
    const input = document.getElementById('maxTokensInput');
    const value = document.getElementById('maxTokensValue');

    if (slider && input) {
        const val = parseInt(input.value) || parseInt(slider.value);
        slider.value = val;
        input.value = val;
        if (value) value.textContent = `${val} tokens`;
    }
}

/**
 * Update temperature display
 */
function updateTemperatureDisplay() {
    const slider = document.getElementById('temperatureSlider');
    const input = document.getElementById('temperatureInput');
    const value = document.getElementById('temperatureValue');

    if (slider && input) {
        const val = parseFloat(input.value) || parseFloat(slider.value);
        slider.value = val;
        input.value = val;
        if (value) value.textContent = val.toFixed(1);
    }
}

/**
 * Auto-resize textarea to fit content
 */
function autoResizeTextarea(textarea) {
    if (!textarea) return;

    // Reset height to get accurate scrollHeight
    textarea.style.height = 'auto';

    // Calculate new height based on content
    const minHeight = 80; // min-height from CSS
    const maxHeight = 300; // max-height from CSS
    const scrollHeight = textarea.scrollHeight;

    // Set height, respecting min and max constraints
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;

    // Show scrollbar if content exceeds max height
    if (scrollHeight > maxHeight) {
        textarea.style.overflowY = 'auto';
    } else {
        textarea.style.overflowY = 'hidden';
    }
}

/**
 * Update character count
 */
function updateCharCount() {
    const input = document.getElementById('promptInput');
    const counter = document.getElementById('charCount');
    if (input && counter) {
        const count = input.value.length;
        counter.textContent = `${count} / 3,000`;
        if (count > 3000) {
            counter.style.color = 'var(--error-color)';
        } else {
            counter.style.color = 'var(--text-tertiary)';
        }
    }
}

/**
 * Render results header
 */
function renderResultsHeader() {
    const container = document.getElementById('resultsHeader');
    if (!container) return;

    container.innerHTML = `
        <h3>Results</h3>
        <div class="results-actions">
            <button onclick="sortResults('quality')">Sort by Quality</button>
            <button onclick="sortResults('time')">Sort by Time</button>
            <button onclick="expandAllResults()">Expand All</button>
            <button onclick="collapseAllResults()">Collapse All</button>
        </div>
    `;
}

/**
 * Render results as chat messages
 */
function renderResults(responses, queryInfo) {
    const chatMessages = document.getElementById('chatMessages');
    const welcomeSection = document.getElementById('welcomeSection');

    // Hide welcome section
    if (welcomeSection) {
        welcomeSection.style.display = 'none';
    }

    if (!chatMessages) {
        // Fallback to old results section if chat messages doesn't exist
        const container = document.getElementById('resultsSection');
        if (!container) return;
        renderResultsLegacy(responses, queryInfo, container);
        return;
    }

    // Show empty state if no messages and no responses
    if (chatMessages.children.length === 0 && (!responses || Object.keys(responses).length === 0)) {
        if (typeof renderEmptyState === 'function') {
            renderEmptyState(chatMessages, {
                icon: '💬',
                title: 'No messages yet',
                description: 'Start a conversation by entering a prompt above. The system will automatically select the best model for your query.',
                actionText: 'Start Chatting',
                actionCallback: 'document.getElementById("promptInput")?.focus()'
            });
        }
        return;
    }

    // Add user message
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user';
    userMessage.innerHTML = `
        <div class="chat-message-header">You</div>
        <div class="chat-message-content">${escapeHtml(queryInfo.prompt || '')}</div>
    `;
    chatMessages.appendChild(userMessage);

    // Determine if UAIP format
    const isUAIP = Object.values(responses)[0]?.uaip || false;

    // Add assistant messages for each model - all collapsed by default
    let messageIndex = 0;
    for (const [modelKey, response] of Object.entries(responses)) {
        const model = getModels().find(m => (m.id || m.ID) === modelKey || (m.model_name || m.ModelName) === modelKey);
        const modelInfo = model || {
            display_name: modelKey,
            DisplayName: modelKey,
            provider: 'unknown',
            Provider: 'unknown'
        };
        const modelName = response.model ||
            modelInfo.display_name ||
            modelInfo.DisplayName ||
            'AI Assistant';

        const assistantMessage = document.createElement('div');
        assistantMessage.className = 'chat-message assistant glass-panel collapsed';
        assistantMessage.dataset.messageIndex = messageIndex;

        const responseText = response.response || response.data || '';
        const success = response.success !== false;
        const time = response.time || response.processing_ms || 0;
        const tokens = response.tokens || response.tokens_used || 0;
        const previewText = responseText.length > 150
            ? escapeHtml(responseText.substring(0, 150)) + '...'
            : escapeHtml(responseText);

        const messageId = `msg-${messageIndex}`;
        assistantMessage.id = messageId;
        assistantMessage.innerHTML = `
            <div class="chat-message-header" style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="toggleChatMessage('${messageId}')">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12px; font-weight: 500;">${escapeHtml(modelName)}</span>
                    ${success ? '<span style="color: var(--success-color); font-size: 14px;">✓</span>' : '<span style="color: var(--error-color); font-size: 14px;">✗</span>'}
                    <span style="font-size:11px;color:var(--text-tertiary);">
                        ${formatResponseTime(time)} • ${formatTokenCount(tokens)} tokens
                    </span>
                </div>
                <button class="expand-toggle-btn" onclick="event.stopPropagation(); toggleChatMessage('${messageId}')" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 4px; font-size: 14px; display: flex; align-items: center;">
                    ▼
                </button>
            </div>
            <div class="chat-message-preview" style="font-size: 13px; color: var(--text-secondary); margin-top: 8px; line-height: 1.5;">
                ${success ? previewText : `<span style="color:var(--error-color);">Error: ${escapeHtml(response.error || 'Unknown error')}</span>`}
            </div>
            <div class="chat-message-content" style="display: none; margin-top: 12px;">
                ${success ? escapeHtml(responseText) : `<span style="color:var(--error-color);">Error: ${escapeHtml(response.error || 'Unknown error')}</span>`}
            </div>
        `;
        chatMessages.appendChild(assistantMessage);
        messageIndex++;
    }

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Render results in legacy format (for compare page)
 */
function renderResultsLegacy(responses, queryInfo, container) {
    if (!container) {
        container = document.getElementById('resultsSection');
        if (!container) return;
    }
    if (!container) return;

    container.innerHTML = '';

    if (!responses || Object.keys(responses).length === 0) {
        container.innerHTML = '<div class="error-message">No results to display</div>';
        container.classList.add('active');
        return;
    }

    // Determine if UAIP format
    const isUAIP = Object.values(responses)[0]?.uaip || false;

    for (const [modelKey, response] of Object.entries(responses)) {
        const model = getModels().find(m => m.id === modelKey || m.model_name === modelKey);
        const modelInfo = model || { display_name: modelKey, provider: 'unknown' };

        const card = createResultCard(modelInfo, response, isUAIP);
        container.appendChild(card);
    }

    container.classList.add('active');
}

/**
 * Create result card
 */
function createResultCard(modelInfo, result, isUAIP = false) {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.dataset.modelId = modelInfo.id || modelInfo.model_name;

    const success = result.success !== false;
    const responseText = result.response || result.data || '';
    const time = result.time || result.processing_ms || 0;
    const tokens = result.tokens || result.tokens_used || 0;
    const quality = result.quality || 0;
    const cost = result.cost || 0;
    const modelName = result.model || modelInfo.display_name || 'Unknown';

    const statusIcon = success ? '✅' : '❌';
    const statusColor = success ? '#4caf50' : '#f44336';

    card.innerHTML = `
        <div class="model-header">
            <div class="model-header-info">
                <span>${modelName}</span>
                <span style="font-size:12px;color:#666;margin-left:10px;">${getProviderDisplayName(modelInfo.provider || 'unknown')}</span>
            </div>
            <div class="model-header-actions">
                <button class="copy-btn" onclick="copyResponse('${card.dataset.modelId}')">Copy</button>
                <span style="color:${statusColor};font-size:20px;">${statusIcon}</span>
            </div>
        </div>
        <div class="response-content" id="response-${card.dataset.modelId}">
            ${success ? escapeHtml(responseText) : `<span class="error-message">Error: ${escapeHtml(result.error || 'Unknown error')}</span>`}
        </div>
        ${responseText.length > 500 ? `<button class="expand-btn" onclick="toggleExpand('${card.dataset.modelId}')">Expand</button>` : ''}
        <div class="metrics">
            <div class="metric">
                <div class="metric-value">${formatResponseTime(time)}</div>
                <div class="metric-label">Time</div>
            </div>
            <div class="metric">
                <div class="metric-value">${formatTokenCount(tokens)}</div>
                <div class="metric-label">Tokens</div>
            </div>
            <div class="metric">
                <div class="metric-value">${formatQualityScore(quality)}</div>
                <div class="metric-label">Quality</div>
            </div>
            ${cost > 0 ? `
            <div class="metric">
                <div class="metric-value">${formatCost(cost)}</div>
                <div class="metric-label">Cost</div>
            </div>
            ` : ''}
        </div>
    `;

    return card;
}

/**
 * Copy response to clipboard
 */
async function copyResponse(modelId) {
    const responseElement = document.getElementById(`response-${modelId}`);
    if (!responseElement) return;

    const text = responseElement.textContent;
    try {
        await navigator.clipboard.writeText(text);
        const btn = event.target;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
        showToast('success', 'Response copied to clipboard');
    } catch (error) {
        showToast('error', 'Failed to copy');
    }
}

/**
 * Toggle expand/collapse
 */
function toggleExpand(modelId) {
    const card = document.querySelector(`[data-model-id="${modelId}"]`);
    if (card) {
        card.classList.toggle('expanded');
        const btn = event.target;
        btn.textContent = card.classList.contains('expanded') ? 'Collapse' : 'Expand';
    }
}

/**
 * Toggle chat message expand/collapse
 */
function toggleChatMessage(messageId) {
    const message = document.getElementById(messageId) || document.querySelector(`[data-message-index="${messageId}"]`);
    if (!message) return;

    const isCollapsed = message.classList.contains('collapsed');
    const content = message.querySelector('.chat-message-content');
    const preview = message.querySelector('.chat-message-preview');
    const toggleBtn = message.querySelector('.expand-toggle-btn');

    if (isCollapsed) {
        message.classList.remove('collapsed');
        if (content) content.style.display = 'block';
        if (preview) preview.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '▲';
    } else {
        message.classList.add('collapsed');
        if (content) content.style.display = 'none';
        if (preview) preview.style.display = 'block';
        if (toggleBtn) toggleBtn.textContent = '▼';
    }
}

/**
 * Show loading state
 */
function showLoading(message = 'Querying AI Models...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');

    if (loadingOverlay) {
        loadingOverlay.classList.add('active');
    }

    if (loadingMessage) {
        loadingMessage.textContent = message;
    }

    setUIState({ loading: true });
}

/**
 * Hide loading state
 */
function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('active');
    }
    setUIState({ loading: false });
}

/**
 * Show error message
 */
function showError(message, details = null) {
    const resultsSection = document.getElementById('resultsSection');
    if (resultsSection) {
        let html = `<div class="error-message">${escapeHtml(message)}</div>`;
        if (details) {
            html += `<div style="margin-top:10px;font-size:12px;color:#666;">${escapeHtml(details)}</div>`;
        }
        resultsSection.innerHTML = html;
        resultsSection.classList.add('active');
    }
    hideLoading();
    showToast('error', 'Error', message);
}

/**
 * Setup health check
 */
function setupHealthCheck() {
    checkHealthStatus();
    setInterval(checkHealthStatus, 30000); // Check every 30 seconds
}

/**
 * Check health status
 */
async function checkHealthStatus() {
    try {
        const health = await checkHealth();
        const statusElement = document.getElementById('healthStatus');
        if (statusElement) {
            statusElement.className = 'health-status online';
            statusElement.title = `${health.models} models, ${health.free_models} free`;
        }
    } catch (error) {
        const statusElement = document.getElementById('healthStatus');
        if (statusElement) {
            statusElement.className = 'health-status';
            statusElement.title = 'Offline';
        }
    }
}

/**
 * Toast notification system
 */
function showToast(type, title, message = '') {
    const container = document.getElementById('toastContainer') || createToastContainer();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-header">${title}</div>
        ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Create toast container
 */
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Sort results
 */
function sortResults(criteria) {
    const container = document.getElementById('resultsSection');
    if (!container) return;

    const cards = Array.from(container.querySelectorAll('.result-card'));

    cards.sort((a, b) => {
        if (criteria === 'quality') {
            const qualityA = parseFloat(a.querySelector('.metric-value')?.textContent) || 0;
            const qualityB = parseFloat(b.querySelector('.metric-value')?.textContent) || 0;
            return qualityB - qualityA;
        } else if (criteria === 'time') {
            const timeA = parseInt(a.querySelector('.metric-value')?.textContent) || 0;
            const timeB = parseInt(b.querySelector('.metric-value')?.textContent) || 0;
            return timeA - timeB;
        }
        return 0;
    });

    cards.forEach(card => container.appendChild(card));
}

/**
 * Expand all results
 */
function expandAllResults() {
    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        card.classList.add('expanded');
        const btn = card.querySelector('.expand-btn');
        if (btn) btn.textContent = 'Collapse';
    });
}

/**
 * Collapse all results
 */
function collapseAllResults() {
    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        card.classList.remove('expanded');
        const btn = card.querySelector('.expand-btn');
        if (btn) btn.textContent = 'Expand';
    });
}

/**
 * Reset settings to defaults
 */
function resetSettings() {
    const defaults = {
        defaultMaxTokens: 200,
        defaultTemperature: 0.7,
        defaultStrategy: 'free_only',
        defaultTask: 'generate'
    };
    updateSettings(defaults);
    renderQuerySettings();
    showToast('success', 'Settings reset to defaults');
}

/**
 * Set model view mode (grid or list)
 */
function setModelView(view) {
    const container = document.getElementById('modelGridContainer');
    const gridBtn = document.querySelector('[data-view="grid"]');
    const listBtn = document.querySelector('[data-view="list"]');
    
    if (!container) return;
    
    // Update container class
    if (view === 'list') {
        container.classList.add('list-view');
    } else {
        container.classList.remove('list-view');
    }
    
    // Update button states
    if (gridBtn && listBtn) {
        if (view === 'list') {
            gridBtn.classList.remove('active');
            listBtn.classList.add('active');
        } else {
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        }
    }
    
    // Save preference
    localStorage.setItem('gaiol_modelView', view);
}

/**
 * Clear search input
 */
function clearSearchInput() {
    const searchInput = document.getElementById('modelsSearchInput');
    const clearBtn = document.getElementById('searchClearBtn');
    
    if (searchInput) {
        searchInput.value = '';
        const filters = getFilters();
        setFilters({ ...filters, search: '' });
        renderModelSelection();
    }
    
    if (clearBtn) {
        clearBtn.style.display = 'none';
    }
}

/**
 * Handle model sorting
 */
function handleModelSort(sortBy) {
    const models = getModels();
    const filters = getFilters();
    const filteredModels = filterModels(models, filters);
    
    let sortedModels = [...filteredModels];
    
    switch (sortBy) {
        case 'name':
            sortedModels = sortModels(sortedModels, 'name');
            break;
        case 'provider':
            sortedModels = sortModels(sortedModels, 'provider');
            break;
        case 'cost':
            sortedModels = sortModels(sortedModels, 'cost');
            break;
        case 'quality':
            sortedModels = sortModels(sortedModels, 'quality');
            break;
    }
    
    // Re-render with sorted models
    const container = document.getElementById('modelGridContainer');
    if (!container) return;
    
    // Temporarily store sorted models
    const originalModels = getModels();
    setModels(sortedModels);
    renderModelSelection();
    // Restore original models
    setModels(originalModels);
}

/**
 * Toggle filter sidebar
 */
function toggleFilterSidebar() {
    const sidebar = document.getElementById('modelsFilterSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        sidebar.classList.toggle('open');
    }
}

// Initialize models page enhancements
document.addEventListener('DOMContentLoaded', function() {
    // Setup search input
    const searchInput = document.getElementById('modelsSearchInput');
    if (searchInput) {
        const clearBtn = document.getElementById('searchClearBtn');
        
        searchInput.addEventListener('input', debounce(() => {
            const value = searchInput.value.trim();
            if (clearBtn) {
                clearBtn.style.display = value ? 'flex' : 'none';
            }
            
            const filters = getFilters();
            setFilters({ ...filters, search: value });
            renderModelSelection();
        }, 300));
        
        // Show clear button if input has value on load
        if (searchInput.value.trim() && clearBtn) {
            clearBtn.style.display = 'flex';
        }
    }
    
    // Load saved view preference
    const savedView = localStorage.getItem('gaiol_modelView') || 'grid';
    if (savedView) {
        setModelView(savedView);
    }
    
    // Update bulk actions visibility
    const selectedModels = getSelectedModels();
    const bulkActions = document.getElementById('modelsBulkActions');
    if (bulkActions) {
        bulkActions.style.display = selectedModels.length > 0 ? 'flex' : 'none';
    }
});

/**
 * Toggle compare settings panel
 */
function toggleCompareSettings() {
    const section = document.querySelector('.compare-settings-section');
    if (section) {
        section.classList.toggle('collapsed');
    }
}

/**
 * Clear prompt input
 */
function clearPromptInput() {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = '';
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(promptInput);
        }
        updateCharCount();
    }
}

/**
 * Sort compare results
 */
function sortCompareResults(criteria) {
    const container = document.getElementById('resultsSection');
    if (!container) return;
    
    const cards = Array.from(container.querySelectorAll('.result-card-compare, .result-card'));
    
    cards.sort((a, b) => {
        if (criteria === 'quality') {
            const qualityA = parseFloat(a.querySelector('.result-metric-value')?.textContent) || 0;
            const qualityB = parseFloat(b.querySelector('.result-metric-value')?.textContent) || 0;
            return qualityB - qualityA;
        } else if (criteria === 'time') {
            // Extract time from metric or text
            const timeA = parseFloat(a.querySelector('[title*="Time"], .result-metric-value')?.textContent) || 0;
            const timeB = parseFloat(b.querySelector('[title*="Time"], .result-metric-value')?.textContent) || 0;
            return timeA - timeB;
        }
        return 0;
    });
    
    cards.forEach(card => container.appendChild(card));
    showToast('info', `Results sorted by ${criteria}`);
}

// Make new functions globally available
window.setModelView = setModelView;
window.clearSearchInput = clearSearchInput;
window.handleModelSort = handleModelSort;
window.toggleFilterSidebar = toggleFilterSidebar;
window.toggleCompareSettings = toggleCompareSettings;
window.clearPromptInput = clearPromptInput;
window.sortCompareResults = sortCompareResults;