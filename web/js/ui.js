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
        { id: 'compare', label: 'Compare Models', icon: '⚡' },
        { id: 'smart', label: 'Smart Query', icon: '🤖' },
        { id: 'single', label: 'Single Model', icon: '🎯' }
    ];

    const currentMode = getUIState().queryMode || 'compare';
    container.innerHTML = modes.map(mode => `
        <button class="query-mode-btn ${currentMode === mode.id ? 'active' : ''}" 
                onclick="setQueryMode('${mode.id}')">
            ${mode.icon} ${mode.label}
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

    container.innerHTML = `
        <div class="filter-controls-container">
            <div class="filter-group">
                <label class="filter-label">Provider</label>
                <select id="providerFilter" class="filter-select">
                    <option value="all">All Providers</option>
                    ${providers.map(p => `<option value="${p}">${getProviderDisplayName(p)}</option>`).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label class="filter-label">Cost</label>
                <select id="costFilter" class="filter-select">
                    <option value="all">All</option>
                    <option value="free">Free Only</option>
                    <option value="premium">Premium</option>
                </select>
            </div>
            <div class="filter-group search">
                <label class="filter-label">Search</label>
                <input type="text" id="modelSearch" class="filter-input" placeholder="Search models...">
            </div>
            <div>
                <button class="btn-secondary" onclick="clearFilters()">Clear</button>
            </div>
        </div>
        ${tags.length > 0 ? `
        <div class="filter-tags-container">
            <div class="filter-tags-label">Tags</div>
            <div class="filter-tags-list">
                ${tags.slice(0, 15).map(tag => `
                    <span class="filter-tag" data-tag="${tag}" onclick="toggleTagFilter('${tag}')">${escapeHtml(tag)}</span>
                `).join('')}
            </div>
        </div>
        ` : ''}
    `;

    // Set current filter values
    const filters = getFilters();
    const providerFilter = document.getElementById('providerFilter');
    if (providerFilter) {
        providerFilter.value = filters.provider || 'all';
        providerFilter.addEventListener('change', handleFilterChange);
    }
    const costFilter = document.getElementById('costFilter');
    if (costFilter) {
        costFilter.value = filters.cost || 'all';
        costFilter.addEventListener('change', handleFilterChange);
    }
    const searchInput = document.getElementById('modelSearch');
    if (searchInput) {
        searchInput.value = filters.search || '';
        const debouncedSearch = debounce(handleFilterChange, 300);
        searchInput.addEventListener('input', debouncedSearch);
    }

    // Add tag click handlers
    container.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', function () {
            const tagName = this.dataset.tag;
            toggleTagFilter(tagName);
        });
    });
}

/**
 * Handle filter change
 */
function handleFilterChange() {
    const filters = {
        provider: document.getElementById('providerFilter')?.value || 'all',
        cost: document.getElementById('costFilter')?.value || 'all',
        search: document.getElementById('modelSearch')?.value || '',
        tags: getFilters().tags || []
    };
    setFilters(filters);
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

    // Update UI
    const tagElement = document.querySelector(`[data-tag="${tag}"]`);
    if (tagElement) {
        tagElement.classList.toggle('active');
    }

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
    renderFilterControls();
    renderModelSelection();
}

/**
 * Render model selection grid
 */
function renderModelSelection() {
    const models = getModels();
    const filters = getFilters();
    const selectedModels = getSelectedModels();
    const queryMode = getUIState().queryMode;

    // Hide model selection in smart query mode
    if (queryMode === 'smart') {
        const modelSelectionContainer = document.getElementById('modelSelectionContainer');
        if (modelSelectionContainer) {
            modelSelectionContainer.style.display = 'none';
        }
        return;
    } else {
        const modelSelectionContainer = document.getElementById('modelSelectionContainer');
        if (modelSelectionContainer) {
            modelSelectionContainer.style.display = 'block';
        }
    }

    // Filter models
    const filtered = filterModels(models, filters);

    // Group by provider
    const grouped = groupModelsByProvider(filtered);

    // Render
    const container = document.getElementById('modelGridContainer');
    if (!container) return;

    let html = '';

    // Model selection actions
    html += `
        <div class="model-selection-actions">
            <button class="btn-secondary" onclick="selectAllModels()">Select All</button>
            <button class="btn-secondary" onclick="deselectAllModels()">Deselect All</button>
            <button class="btn-secondary" onclick="selectAllFreeModels()">Select Free</button>
            <span class="model-selection-count">
                ${selectedModels.length} selected
            </span>
        </div>
    `;

    // Render by provider
    for (const [provider, providerModels] of Object.entries(grouped)) {
        html += `
            <div class="provider-group">
                <div class="provider-group-header">
                    ${getProviderDisplayName(provider)} (${providerModels.length})
                </div>
                <div class="model-grid-modern">
        `;

        providerModels.forEach(model => {
            // Handle both Go JSON format (capitalized) and snake_case format
            const modelId = model.id || model.ID || '';
            const isSelected = selectedModels.includes(modelId);

            // Get model name - try multiple field name formats
            const modelName = model.display_name ||
                model.DisplayName ||
                model.model_name ||
                model.ModelName ||
                (modelId ? modelId.split(':').pop().split('/').pop().replace(/:free$/, '') : 'Unknown Model');

            // Get provider - try multiple formats
            const modelProvider = model.provider ||
                model.Provider ||
                (modelId && modelId.includes(':') ? modelId.split(':')[0] : provider) ||
                'unknown';

            // Get quality score
            const qualityScore = model.quality_score ||
                model.QualityScore ||
                0;
            const qualityPercent = (qualityScore * 100).toFixed(0);
            const qualityDisplay = qualityPercent > 0 ? `${qualityPercent}%` : 'N/A';

            // Get cost info - handle both formats
            const costInfo = model.cost_info || model.CostInfo || {};
            const costPerToken = costInfo.cost_per_token ||
                costInfo.CostPerToken ||
                0;
            const isFree = costPerToken === 0;

            // Format cost display
            const costDisplay = formatCost(costPerToken);

            // Escape modelId for use in HTML attributes
            const escapedModelId = escapeHtml(modelId);
            const checkboxId = `model-${escapedModelId.replace(/[^a-zA-Z0-9-]/g, '_')}`;

            html += `
                <div class="model-card-modern ${isSelected ? 'selected' : ''}" data-model-id="${escapedModelId}" onclick="handleModelCardClick('${escapedModelId}')">
                    <div class="model-card-content">
                        <input type="checkbox" 
                               class="model-checkbox" 
                               id="${checkboxId}" 
                               ${isSelected ? 'checked' : ''}
                               onclick="event.stopPropagation(); handleModelCardClick('${escapedModelId}')">
                        <div class="model-info">
                            <div class="model-name-row">
                                <div class="model-name">${escapeHtml(modelName)}</div>
                                <span class="model-badge ${isFree ? 'free' : 'premium'}">${isFree ? 'FREE' : 'PREMIUM'}</span>
                            </div>
                            <div class="model-provider">${getProviderDisplayName(modelProvider)}</div>
                            <div class="model-metrics">
                                <span>Quality: ${qualityDisplay}</span>
                                <span>Cost: ${costDisplay}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
    }

    container.innerHTML = html;

    // Add event listeners after rendering
    container.querySelectorAll('.model-card-modern').forEach(card => {
        const modelId = card.dataset.modelId;
        if (modelId) {
            card.addEventListener('click', function (e) {
                if (e.target.type !== 'checkbox') {
                    toggleModelSelectionUI(modelId);
                }
            });
        }
    });
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

    let html = `
        <div class="query-settings-header" onclick="toggleSettingsPanel()">
            <h3>⚙️ Query Settings</h3>
            <span id="settingsToggle">▼</span>
        </div>
        <div class="query-settings-content" id="settingsContent">
            <div class="setting-group">
                <label>Max Tokens</label>
                <input type="range" id="maxTokensSlider" min="50" max="4096" value="${settings.defaultMaxTokens || 200}" step="50">
                <input type="number" id="maxTokensInput" min="50" max="4096" value="${settings.defaultMaxTokens || 200}">
                <div class="setting-value" id="maxTokensValue">${settings.defaultMaxTokens || 200} tokens</div>
            </div>
            <div class="setting-group">
                <label>Temperature</label>
                <input type="range" id="temperatureSlider" min="0" max="2" value="${settings.defaultTemperature || 0.7}" step="0.1">
                <input type="number" id="temperatureInput" min="0" max="2" value="${settings.defaultTemperature || 0.7}" step="0.1">
                <div class="setting-value" id="temperatureValue">${settings.defaultTemperature || 0.7}</div>
            </div>
    `;

    // Smart routing settings (only in smart mode)
    if (queryMode === 'smart') {
        html += `
            <div class="setting-group">
                <label>Strategy</label>
                <select id="strategySelect">
                    <option value="free_only" ${settings.defaultStrategy === 'free_only' ? 'selected' : ''}>Free Only</option>
                    <option value="lowest_cost" ${settings.defaultStrategy === 'lowest_cost' ? 'selected' : ''}>Lowest Cost</option>
                    <option value="highest_quality" ${settings.defaultStrategy === 'highest_quality' ? 'selected' : ''}>Highest Quality</option>
                    <option value="balanced" ${settings.defaultStrategy === 'balanced' ? 'selected' : ''}>Balanced</option>
                </select>
            </div>
            <div class="setting-group">
                <label>Task Type</label>
                <select id="taskSelect">
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
            <div class="setting-group">
                <label>Select Model</label>
                <select id="singleModelSelect">
                    <option value="">Choose a model...</option>
                    ${models.map(m => `<option value="${m.id}">${m.display_name || m.model_name}</option>`).join('')}
                </select>
            </div>
        `;
    }

    html += `
            <div class="setting-group">
                <button onclick="resetSettings()" style="padding:8px 15px;background:#f0f0f0;border:1px solid #e0e0e0;border-radius:5px;cursor:pointer;">Reset to Defaults</button>
            </div>
        </div>
    `;

    container.innerHTML = html;
    updateMaxTokensDisplay();
    updateTemperatureDisplay();
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
    const minHeight = 56; // min-height from CSS
    const maxHeight = 200; // max-height from CSS
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
