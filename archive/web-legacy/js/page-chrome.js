// page-chrome.js — navigation, features, sidebar UI, design enhancements (single load)
// Navigation Module
// Handles page switching and UI navigation

/**
 * Escape HTML text (helper function)
 */
function escapeHtmlText(text) {
    if (typeof escapeHtml === 'function') {
        return escapeHtml(text);
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Switch to a different page
 * Now redirects to actual page files instead of showing/hiding divs
 */
function switchPage(pageId) {
    const pageMap = {
        'chat': '/chat',
        'history': '/history.html',
        'settings': '/settings.html',
        'profile': '/profile.html',
        'login': '/login.html',
        'signup': '/signup.html'
    };

    const targetUrl = pageMap[pageId];
    if (targetUrl) {
        window.location.href = targetUrl;
    } else {
        console.warn('Unknown page ID:', pageId);
    }
}

/**
 * Load content for specific page
 * Called when page loads (not for navigation)
 */
function loadPageContent(pageId) {
    // Determine page ID from current URL
    const path = window.location.pathname;
    if (path.includes('history.html')) pageId = 'history';
    else if (path.includes('settings.html')) pageId = 'settings';
    else if (path.includes('profile.html')) pageId = 'profile';
    else if (path.includes('login.html')) pageId = 'login';
    else if (path.includes('signup.html')) pageId = 'signup';
    else if (path === '/chat' || path.endsWith('/chat') || path.endsWith('/chat.html')) pageId = 'chat';
    else return;

    switch (pageId) {
        case 'chat':
            // Chat page is already set up
            break;
        case 'history':
            if (typeof renderHistory === 'function') renderHistory();
            break;
        case 'settings':
            if (typeof loadSettingsPage === 'function') loadSettingsPage();
            break;
        case 'login':
        case 'signup':
            // Auth pages handle their own content
            break;
        case 'profile':
            // Profile page loads user data via auth.js
            if (typeof loadUserProfile === 'function' && typeof isAuthenticated === 'function' && isAuthenticated()) {
                loadUserProfile().then(() => {
                    if (typeof updateProfilePage === 'function') {
                        updateProfilePage();
                    }
                }).catch(error => {
                    console.error('Failed to load profile:', error);
                });
            }
            break;
    }
}

/**
 * Toggle left sidebar (desktop: collapsed = hidden; mobile: open = visible)
 */
function toggleLeftSidebar() {
    const sidebar = document.getElementById('leftSidebar');
    if (!sidebar) return;
    const isCollapsed = sidebar.classList.contains('collapsed');
    const isOpen = sidebar.classList.contains('open');
    // Desktop: toggle collapsed. Mobile: open means "drawer visible", so toggle open and keep collapsed false when showing
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
        if (sidebar.classList.contains('open')) {
            sidebar.classList.remove('collapsed');
        } else {
            sidebar.classList.add('collapsed');
        }
    } else {
        sidebar.classList.toggle('collapsed');
        sidebar.classList.remove('open');
    }
}

/**
 * Toggle right sidebar
 */
function toggleRightSidebar() {
    const sidebar = document.getElementById('rightSidebar');
    const toggleBtn = document.getElementById('rightSidebarToggle');
    const floatingToggle = document.getElementById('rightSidebarToggleFloating');

    if (sidebar) {
        const isCollapsed = sidebar.classList.contains('collapsed');
        sidebar.classList.toggle('collapsed');

        // Update toggle button icon
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('.sidebar-toggle-icon');
            if (icon) {
                if (isCollapsed) {
                    // Opening - show left arrow
                    icon.innerHTML = '<path d="M6 15l-5-5 5-5M14 5l5 5-5 5"/>';
                } else {
                    // Closing - show right arrow
                    icon.innerHTML = '<path d="M14 15l5-5-5-5M6 5l-5 5 5 5"/>';
                }
            }
        }

        // Show/hide floating toggle button
        if (floatingToggle) {
            if (isCollapsed) {
                // Sidebar is opening, hide floating button
                floatingToggle.style.display = 'none';
            } else {
                // Sidebar is closing, show floating button
                floatingToggle.style.display = 'flex';
            }
        }

        // Save sidebar state
        const newState = !isCollapsed;
        localStorage.setItem('rightSidebarCollapsed', newState.toString());
    }
}

/**
 * Initialize right sidebar state on load
 */
function initializeRightSidebar() {
    const savedState = localStorage.getItem('rightSidebarCollapsed');
    const sidebar = document.getElementById('rightSidebar');
    const floatingToggle = document.getElementById('rightSidebarToggleFloating');

    if (savedState === 'true' && sidebar) {
        sidebar.classList.add('collapsed');
        if (floatingToggle) {
            floatingToggle.style.display = 'flex';
        }
    } else {
        if (floatingToggle) {
            floatingToggle.style.display = 'none';
        }
    }
}

/**
 * Set theme
 */
function setTheme(theme) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((theme === 'light' && btn.textContent.trim() === 'Light') ||
            (theme === 'dark' && btn.textContent.trim() === 'Dark')) {
            btn.classList.add('active');
        }
    });

    if (typeof saveToLocalStorage === 'function') {
        saveToLocalStorage('theme', theme);
    } else {
        localStorage.setItem('theme', theme);
    }
}

/**
 * Load theme from storage
 */
function loadTheme() {
    const theme = loadFromLocalStorage('theme', 'light');
    setTheme(theme);
}

/**
 * Set quick prompt from quick action
 */
function setQuickPrompt(prompt) {
    const input = document.getElementById('promptInput');
    if (input) {
        input.value = prompt;
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(input);
        }
        input.focus();
        updateCharCount();
    }

    // Hide welcome section
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'none';
    }
}

/**
 * Refresh models list
 */
async function refreshModels() {
    showLoading('Refreshing models...');
    try {
        await loadModelsFromAPI();
        renderModelSelection();
        renderFilterControls();
        hideLoading();
        showToast('success', 'Models refreshed');
    } catch (error) {
        hideLoading();
        showToast('error', 'Failed to refresh models', error.message);
    }
}

/**
 * Load settings page
 */
function loadSettingsPage() {
    const settings = getSettings();
    const defaultStrategy = document.getElementById('defaultStrategy');
    const defaultMaxTokens = document.getElementById('defaultMaxTokens');
    const defaultTemperature = document.getElementById('defaultTemperature');

    if (defaultStrategy) {
        defaultStrategy.value = settings.defaultStrategy || 'free_only';
        defaultStrategy.addEventListener('change', saveSettings);
    }
    if (defaultMaxTokens) {
        defaultMaxTokens.value = settings.defaultMaxTokens || 200;
        defaultMaxTokens.addEventListener('change', saveSettings);
    }
    if (defaultTemperature) {
        defaultTemperature.value = settings.defaultTemperature || 0.7;
        defaultTemperature.addEventListener('change', saveSettings);
    }
}

/**
 * Save settings from settings page
 */
function saveSettings() {
    const defaultStrategy = document.getElementById('defaultStrategy')?.value;
    const defaultMaxTokens = parseInt(document.getElementById('defaultMaxTokens')?.value);
    const defaultTemperature = parseFloat(document.getElementById('defaultTemperature')?.value);

    const newSettings = {};
    if (defaultStrategy) newSettings.defaultStrategy = defaultStrategy;
    if (defaultMaxTokens) newSettings.defaultMaxTokens = defaultMaxTokens;
    if (defaultTemperature !== undefined) newSettings.defaultTemperature = defaultTemperature;

    updateSettings(newSettings);
    showToast('success', 'Settings saved', 'Your preferences have been saved');
}

/**
 * Render recent queries in right sidebar
 */
function renderRecentQueries() {
    // Use renderHistory which handles both sidebar and page
    if (typeof renderHistory === 'function') {
        renderHistory();
    }
}

/**
 * Update sidebar stats
 */
function updateSidebarStats() {
    const models = getModels();
    const selectedModels = getSelectedModels();

    // Check if isModelFree is available
    let freeModels = [];
    if (typeof isModelFree === 'function') {
        freeModels = models.filter(model => isModelFree(model));
    } else {
        // Fallback: check if cost is 0 or model name contains "free"
        freeModels = models.filter(model => {
            const costInfo = model.cost_info || model.CostInfo || {};
            const costPerToken = costInfo.cost_per_token || costInfo.CostPerToken || 0;
            const modelId = (model.id || model.ID || '').toLowerCase();
            return costPerToken === 0 || modelId.includes('free');
        });
    }

    const totalCount = document.getElementById('totalModelsCount');
    const freeCount = document.getElementById('freeModelsCount');
    const selectedCount = document.getElementById('selectedModelsCount');

    if (totalCount) totalCount.textContent = models.length;
    if (freeCount) freeCount.textContent = freeModels.length;
    if (selectedCount) selectedCount.textContent = selectedModels.length;
}

/**
 * Render selected models dropdown in right sidebar
 */
function renderSelectedModelsDropdown() {
    // Try new location first, then fallback to old
    let container = document.getElementById('selectedModelsContent');
    if (!container) {
        container = document.getElementById('selectedModelsDropdown');
    }
    if (!container) return;

    const selectedModelIds = getSelectedModels();
    const models = getModels();

    if (selectedModelIds.length === 0) {
        container.innerHTML = `
            <div class="no-selected-models">
                No models selected
            </div>
        `;
        return;
    }

    const selectedModels = selectedModelIds
        .map(id => {
            const model = models.find(m => (m.id || m.ID) === id);
            return model ? { id, model } : null;
        })
        .filter(item => item !== null);

    let html = `
        <div class="selected-models-dropdown" id="selectedModelsDropdownContent">
            <div class="selected-models-header" onclick="toggleSelectedModelsDropdown()">
                <div>
                    <div style="font-size: 13px; font-weight: 500; color: var(--text-primary);">
                        ${selectedModels.length} model${selectedModels.length > 1 ? 's' : ''} selected
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="selected-models-count">${selectedModels.length}</span>
                    <span class="selected-models-toggle">â–¼</span>
                </div>
            </div>
            <div class="selected-models-list">
    `;

    selectedModels.forEach(({ id, model }) => {
        const modelName = model.display_name ||
            model.DisplayName ||
            model.model_name ||
            model.ModelName ||
            (id ? id.split(':').pop().split('/').pop() : 'Unknown');
        const provider = model.provider ||
            model.Provider ||
            (id && id.includes(':') ? id.split(':')[0] : 'unknown');

        html += `
            <div class="selected-model-item">
                <div class="selected-model-info">
                    <div class="selected-model-name">${escapeHtmlText(modelName)}</div>
                    <div class="selected-model-provider">${getProviderDisplayName(provider)}</div>
                </div>
                <button class="remove-model-btn" onclick="removeSelectedModel('${id}')" title="Remove model" aria-label="Remove model">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 5l10 10M15 5l-10 10"/>
                    </svg>
                </button>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Toggle selected models dropdown
 */
function toggleSelectedModelsDropdown() {
    const dropdown = document.getElementById('selectedModelsDropdownContent');
    if (!dropdown) return;

    dropdown.classList.toggle('open');
    const header = dropdown.querySelector('.selected-models-header');
    if (header) {
        header.classList.toggle('active');
    }
}

/**
 * Remove model from selection
 */
function removeSelectedModel(modelId) {
    const selected = getSelectedModels();
    const index = selected.indexOf(modelId);
    if (index > -1) {
        selected.splice(index, 1);
        setSelectedModels(selected);
        renderSelectedModelsDropdown();
        // Update model selection UI if on models page
        if (typeof renderModelSelection === 'function') {
            renderModelSelection();
        }
        showToast('info', 'Model removed from selection');
    }
}

// Initialize navigation on load
document.addEventListener('DOMContentLoaded', function () {
    loadTheme();
    renderRecentQueries();
    renderSelectedModelsDropdown();
    updateSidebarStats();

    // Initialize right sidebar state
    initializeRightSidebar();

    // Update recent queries when history changes
    subscribeStateChange(() => {
        renderRecentQueries();
        updateSidebarStats();
    });
});

// Make functions globally available
window.switchPage = switchPage;
window.toggleLeftSidebar = toggleLeftSidebar;
window.toggleRightSidebar = toggleRightSidebar;
window.setTheme = setTheme;
window.setQuickPrompt = setQuickPrompt;
window.refreshModels = refreshModels;
window.saveSettings = saveSettings;
window.renderSelectedModelsDropdown = renderSelectedModelsDropdown;
window.toggleSelectedModelsDropdown = toggleSelectedModelsDropdown;
window.removeSelectedModel = removeSelectedModel;
window.updateSidebarStats = updateSidebarStats;
window.replayQueryFromSidebar = replayQueryFromSidebar;
window.initializeRightSidebar = initializeRightSidebar;

/**
 * Reset settings to defaults
 */
function resetSettingsToDefaults() {
    const defaults = {
        defaultStrategy: 'free_only',
        defaultMaxTokens: 200,
        defaultTemperature: 0.7
    };

    updateSettings(defaults);
    loadSettingsPage();
    showToast('success', 'Settings reset', 'All settings have been reset to defaults');
}

window.resetSettingsToDefaults = resetSettingsToDefaults;

// ----- features -----

// Additional Features Module
// Voice message, file attachment, browse prompts, global search

/**
 * Initialize additional features
 */
function initializeFeatures() {
    setupVoiceMessage();
    setupFileAttachment();
    setupBrowsePrompts();
    setupGlobalSearch();
}

/**
 * Setup voice message functionality
 */
function setupVoiceMessage() {
    const voiceBtn = document.querySelector('[title="Voice"]');
    if (!voiceBtn) return;
    
    let recognition = null;
    let isListening = false;
    
    // Check if browser supports speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            const promptInput = document.getElementById('promptInput');
            if (promptInput) {
                promptInput.value = transcript;
                if (typeof autoResizeTextarea === 'function') {
                    autoResizeTextarea(promptInput);
                }
                updateCharCount();
            }
            isListening = false;
            voiceBtn.textContent = 'ðŸŽ¤';
            voiceBtn.style.background = '';
            showToast('success', 'Voice input captured', transcript.substring(0, 50) + '...');
        };
        
        recognition.onerror = function(event) {
            isListening = false;
            voiceBtn.textContent = 'ðŸŽ¤';
            voiceBtn.style.background = '';
            showToast('error', 'Voice recognition error', event.error);
        };
        
        recognition.onend = function() {
            isListening = false;
            voiceBtn.textContent = 'ðŸŽ¤';
            voiceBtn.style.background = '';
        };
        
        voiceBtn.addEventListener('click', function() {
            if (!isListening) {
                try {
                    recognition.start();
                    isListening = true;
                    voiceBtn.textContent = 'ðŸ”´';
                    voiceBtn.style.background = 'var(--error-color)';
                    showToast('info', 'Listening...', 'Speak your prompt');
                } catch (error) {
                    showToast('error', 'Voice recognition not available', 'Please use a supported browser');
                }
            } else {
                recognition.stop();
                isListening = false;
                voiceBtn.textContent = 'ðŸŽ¤';
                voiceBtn.style.background = '';
            }
        });
    } else {
        voiceBtn.addEventListener('click', function() {
            showToast('error', 'Voice recognition not supported', 'Your browser does not support speech recognition');
        });
    }
}

/**
 * Setup file attachment functionality
 */
function setupFileAttachment() {
    const attachBtn = document.querySelector('[title="Attach"]');
    if (!attachBtn) return;
    
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md,.json,.csv';
    fileInput.style.display = 'none';
    fileInput.id = 'fileInput';
    document.body.appendChild(fileInput);
    
    attachBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 1024 * 1024) { // 1MB limit
            showToast('error', 'File too large', 'Please select a file smaller than 1MB');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const content = e.target.result;
            const promptInput = document.getElementById('promptInput');
            
            if (promptInput) {
                // Add file content to prompt
                const currentPrompt = promptInput.value;
                const filePrompt = `[Attached file: ${file.name}]\n\n${content}\n\nPlease process the above content.`;
                promptInput.value = currentPrompt ? `${currentPrompt}\n\n${filePrompt}` : filePrompt;
                if (typeof autoResizeTextarea === 'function') {
                    autoResizeTextarea(promptInput);
                }
                updateCharCount();
                showToast('success', 'File attached', `${file.name} has been added to your prompt`);
            }
        };
        
        reader.onerror = function() {
            showToast('error', 'File read error', 'Failed to read the file');
        };
        
        reader.readAsText(file);
    });
}

/**
 * Setup browse prompts functionality
 */
function setupBrowsePrompts() {
    const browseBtn = document.querySelector('[title="Browse Prompts"]');
    if (!browseBtn) return;
    
    const promptTemplates = [
        { category: 'Writing', prompts: [
            'Write a professional email to...',
            'Create a blog post about...',
            'Write a product description for...',
            'Draft a social media post about...'
        ]},
        { category: 'Code', prompts: [
            'Write a function to...',
            'Explain this code:',
            'Debug the following:',
            'Optimize this algorithm:'
        ]},
        { category: 'Analysis', prompts: [
            'Analyze the pros and cons of...',
            'Compare and contrast...',
            'Explain the concept of...',
            'Summarize the following:'
        ]},
        { category: 'Creative', prompts: [
            'Write a story about...',
            'Create a poem about...',
            'Generate ideas for...',
            'Brainstorm solutions for...'
        ]},
        { category: 'Business', prompts: [
            'Create a business plan for...',
            'Write a marketing strategy for...',
            'Analyze market trends for...',
            'Draft a proposal for...'
        ]}
    ];
    
    browseBtn.addEventListener('click', function() {
        showPromptLibrary(promptTemplates);
    });
}

/**
 * Show prompt library modal
 */
function showPromptLibrary(templates) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'prompt-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 30px;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        width: 90%;
        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    `;
    
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <h2 style="font-size: 24px; font-weight: 700; color: var(--text-primary);">Browse Prompts</h2>
            <button onclick="this.closest('.prompt-modal').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>
    `;
    
    templates.forEach(category => {
        html += `
            <div style="margin-bottom: 25px;">
                <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">
                    ${category.category}
                </h3>
                <div style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        category.prompts.forEach(prompt => {
            html += `
                <button onclick="selectPromptTemplate('${escapeHtml(prompt)}'); this.closest('.prompt-modal').remove();" 
                        style="text-align: left; padding: 12px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; color: var(--text-primary);"
                        onmouseover="this.style.background='var(--bg-tertiary)'; this.style.borderColor='var(--accent-color)';"
                        onmouseout="this.style.background='var(--bg-secondary)'; this.style.borderColor='var(--border-color)';">
                    ${escapeHtml(prompt)}
                </button>
            `;
        });
        
        html += `</div></div>`;
    });
    
    modalContent.innerHTML = html;
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Close on background click
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * Select prompt template
 */
function selectPromptTemplate(prompt) {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = prompt;
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(promptInput);
        }
        promptInput.focus();
        updateCharCount();
        showToast('success', 'Prompt selected', 'You can edit the prompt before sending');
    }
}

/**
 * Setup global search (âŒ˜K / Ctrl+K)
 */
function setupGlobalSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;
    
    // Keyboard shortcut handler
    document.addEventListener('keydown', function(e) {
        // âŒ˜K on Mac, Ctrl+K on Windows/Linux
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });
    
    // Search functionality
    let searchTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();
        
        if (query.length < 2) {
            hideSearchResults();
            return;
        }
        
        searchTimeout = setTimeout(() => {
            performGlobalSearch(query);
        }, 300);
    });
    
    // Show search results on focus
    searchInput.addEventListener('focus', function() {
        if (this.value.trim().length >= 2) {
            performGlobalSearch(this.value.trim());
        }
    });
    
    // Close search results on escape
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideSearchResults();
            this.blur();
        }
    });
}

/**
 * Perform global search
 */
function performGlobalSearch(query) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Search models
    const models = getModels();
    models.forEach(model => {
        const name = (model.display_name || model.model_name || '').toLowerCase();
        const provider = (model.provider || '').toLowerCase();
        const tags = (model.tags || []).join(' ').toLowerCase();
        
        if (name.includes(queryLower) || provider.includes(queryLower) || tags.includes(queryLower)) {
            results.push({
                type: 'model',
                title: model.display_name || model.model_name,
                subtitle: `Provider: ${getProviderDisplayName(model.provider)}`,
                action: function() {
                    if (typeof switchPage === 'function') {
                        switchPage('models');
                    }
                    setTimeout(() => {
                        const modelSearch = document.getElementById('modelSearch');
                        if (modelSearch) {
                            modelSearch.value = query;
                            if (typeof handleFilterChange === 'function') {
                                handleFilterChange();
                            }
                        }
                    }, 100);
                }
            });
        }
    });
    
    // Search history
    const history = getHistory();
    history.forEach(item => {
        const prompt = (item.prompt || '').toLowerCase();
        if (prompt.includes(queryLower)) {
            results.push({
                type: 'history',
                title: item.prompt.length > 50 ? item.prompt.substring(0, 50) + '...' : item.prompt,
                subtitle: `From ${new Date(item.timestamp).toLocaleDateString()}`,
                action: function() {
                    if (typeof replayQuery === 'function') {
                        replayQuery(item.id);
                    }
                }
            });
        }
    });
    
    // Show search results
    showSearchResults(results, query);
}

/**
 * Show search results dropdown
 */
function showSearchResults(results, query) {
    // Remove existing results
    hideSearchResults();
    
    if (results.length === 0) {
        return;
    }
    
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;
    
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'globalSearchResults';
    resultsContainer.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        margin-top: 5px;
        max-height: 400px;
        overflow-y: auto;
        z-index: 1000;
    `;
    
    const resultsDiv = document.createElement('div');
    resultsDiv.style.padding = '10px';
    
    // Group by type
    const byType = {};
    results.forEach(result => {
        if (!byType[result.type]) {
            byType[result.type] = [];
        }
        byType[result.type].push(result);
    });
    
    Object.entries(byType).forEach(([type, items]) => {
        const typeLabel = type === 'model' ? 'Models' : 'History';
        const typeHeader = document.createElement('div');
        typeHeader.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; margin: 10px 0 5px 0; padding: 0 10px;';
        typeHeader.textContent = typeLabel;
        resultsDiv.appendChild(typeHeader);
        
        items.slice(0, 5).forEach((item) => {
            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = 'padding: 10px; cursor: pointer; border-radius: 6px; transition: background 0.2s;';
            itemDiv.onmouseover = function() { this.style.background = 'var(--bg-secondary)'; };
            itemDiv.onmouseout = function() { this.style.background = 'transparent'; };
            itemDiv.onclick = function() {
                item.action();
                hideSearchResults();
            };
            
            const titleDiv = document.createElement('div');
            titleDiv.style.cssText = 'font-size: 13px; font-weight: 500; color: var(--text-primary); margin-bottom: 2px;';
            titleDiv.textContent = item.title;
            
            const subtitleDiv = document.createElement('div');
            subtitleDiv.style.cssText = 'font-size: 11px; color: var(--text-tertiary);';
            subtitleDiv.textContent = item.subtitle;
            
            itemDiv.appendChild(titleDiv);
            itemDiv.appendChild(subtitleDiv);
            resultsDiv.appendChild(itemDiv);
        });
    });
    
    resultsContainer.appendChild(resultsDiv);
    
    // Position relative to search input
    const searchContainer = searchInput.parentElement;
    searchContainer.style.position = 'relative';
    searchContainer.appendChild(resultsContainer);
}

/**
 * Hide search results
 */
function hideSearchResults() {
    const existing = document.getElementById('globalSearchResults');
    if (existing) {
        existing.remove();
    }
}

// Make functions globally available
window.selectPromptTemplate = selectPromptTemplate;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    initializeFeatures();
});


// ----- sidebar-features -----

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
        const safeModelName = modelName || 'Unknown Model';
        html += `
            <div class="model-performance-item">
                <div class="model-performance-name">${escapeHtml((safeModelName || "").substring(0, 20))}</div>
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
        const recName = rec.name || rec.id || 'Recommended Model';
        html += `
            <div class="recommendation-item" onclick="selectRecommendedModel('${rec.id}')">
                ${escapeHtml((recName || "").substring(0, 25))}
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
                <div class="favorite-item-name">${escapeHtml((fav.name || "").substring(0, 25))}</div>
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
        name: (name || "").substring(0, 50),
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
        { key: 'âŒ˜K / Ctrl+K', action: 'Global search' },
        { key: 'âŒ˜Enter / Ctrl+Enter', action: 'Send query' },
        { key: 'âŒ˜/ / Ctrl+/', action: 'Show shortcuts' },
        { key: 'Esc', action: 'Close modals' },
        { key: 'âŒ˜N / Ctrl+N', action: 'New chat' }
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
                <span style="font-size: 11px;">${escapeHtml((modelName || "").substring(0, 20))}</span>
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


// ----- design-enhancements -----

// Design Enhancements - Quick Wins Implementation
// Adds loading skeletons, empty states, tooltips, keyboard shortcuts, and more

/**
 * Show skeleton loader in a container
 */
function showSkeletonLoader(container, count = 3) {
    if (!container) return;
    
    const skeletonHTML = Array(count).fill(0).map(() => `
        <div class="skeleton skeleton-text" style="width: ${Math.random() * 30 + 70}%;"></div>
    `).join('');
    
    container.innerHTML = `
        <div class="skeleton-card">
            ${skeletonHTML}
        </div>
    `;
}

/**
 * Render empty state
 */
function renderEmptyState(container, options = {}) {
    if (!container) return;
    
    const {
        icon = 'ðŸ’¬',
        title = 'No items',
        description = 'Get started by creating your first item.',
        actionText = null,
        actionCallback = null
    } = options;
    
    const actionHTML = actionText && actionCallback ? `
        <div class="empty-state-action">
            <button class="btn-primary" onclick="${actionCallback}">
                ${actionText}
            </button>
        </div>
    ` : '';
    
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">${icon}</div>
            <div class="empty-state-title">${title}</div>
            <div class="empty-state-description">${description}</div>
            ${actionHTML}
        </div>
    `;
}

/**
 * Initialize tooltips
 */
function initializeTooltips() {
    // Tooltips are handled via CSS data attributes
    // This function can be used for dynamic tooltip updates
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        // Tooltip functionality is CSS-based, but we can add JS enhancements
        element.addEventListener('mouseenter', function() {
            // Optional: Add dynamic tooltip content updates
        });
    });
}

/**
 * Keyboard Shortcuts Modal
 */
let shortcutsModal = null;

function createShortcutsModal() {
    if (shortcutsModal) return shortcutsModal;
    
    const modal = document.createElement('div');
    modal.id = 'shortcutsModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Keyboard Shortcuts</h2>
                <button class="icon-btn" onclick="closeShortcutsModal()" aria-label="Close">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 5L5 15M5 5l10 10"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <div class="shortcut-list">
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? 'âŒ˜' : 'Ctrl'}</kbd><kbd>K</kbd>
                        </div>
                        <div class="shortcut-description">Global search</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? 'âŒ˜' : 'Ctrl'}</kbd><kbd>Enter</kbd>
                        </div>
                        <div class="shortcut-description">Send message</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? 'âŒ˜' : 'Ctrl'}</kbd><kbd>/</kbd>
                        </div>
                        <div class="shortcut-description">Show shortcuts</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>Esc</kbd>
                        </div>
                        <div class="shortcut-description">Close modal</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? 'âŒ˜' : 'Ctrl'}</kbd><kbd>B</kbd>
                        </div>
                        <div class="shortcut-description">Toggle sidebar</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    shortcutsModal = modal;
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeShortcutsModal();
        }
    });
    
    return modal;
}

function openShortcutsModal() {
    const modal = createShortcutsModal();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeShortcutsModal() {
    if (shortcutsModal) {
        shortcutsModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Cmd+? or Ctrl+? to open shortcuts
        if ((e.metaKey || e.ctrlKey) && e.key === '?') {
            e.preventDefault();
            openShortcutsModal();
        }
        
        // Cmd+/ or Ctrl+/ to open shortcuts (alternative)
        if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            openShortcutsModal();
        }
        
        // Cmd+Enter or Ctrl+Enter to send message
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            const promptInput = document.getElementById('promptInput');
            if (promptInput && document.activeElement === promptInput) {
                e.preventDefault();
                if (typeof handleQuerySubmit === 'function') {
                    handleQuerySubmit();
                }
            }
        }
        
        // Esc to close modals
        if (e.key === 'Escape') {
            closeShortcutsModal();
            // Close any other open modals
            const openModals = document.querySelectorAll('.modal[style*="flex"]');
            openModals.forEach(modal => {
                if (modal.id !== 'shortcutsModal') {
                    modal.style.display = 'none';
                }
            });
        }
    });
}

/**
 * Create progress bar
 */
function createProgressBar(container, initialPercent = 0) {
    if (!container) return null;
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.innerHTML = `
        <div class="progress-fill" style="width: ${initialPercent}%"></div>
    `;
    
    container.appendChild(progressBar);
    
    return {
        element: progressBar,
        update: (percent) => {
            const fill = progressBar.querySelector('.progress-fill');
            if (fill) {
                fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
            }
        },
        remove: () => {
            progressBar.remove();
        }
    };
}

/**
 * Add loading state to button
 */
function setButtonLoading(button, loading = true) {
    if (!button) return;
    
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
        button.disabled = false;
    }
}

/**
 * Initialize all design enhancements
 */
function initializeDesignEnhancements() {
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Initialize tooltips
    initializeTooltips();
    
    // Create shortcuts modal (but don't show it)
    createShortcutsModal();
    
    console.log('Design enhancements initialized');
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDesignEnhancements);
} else {
    initializeDesignEnhancements();
}

// Make functions globally available
window.showSkeletonLoader = showSkeletonLoader;
window.renderEmptyState = renderEmptyState;
window.openShortcutsModal = openShortcutsModal;
window.closeShortcutsModal = closeShortcutsModal;
window.createProgressBar = createProgressBar;
window.setButtonLoading = setButtonLoading;

