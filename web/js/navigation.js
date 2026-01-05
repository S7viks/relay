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
        'chat': '/index.html',
        'models': '/models.html',
        'compare': '/compare.html',
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
    if (path.includes('models.html')) pageId = 'models';
    else if (path.includes('compare.html')) pageId = 'compare';
    else if (path.includes('history.html')) pageId = 'history';
    else if (path.includes('settings.html')) pageId = 'settings';
    else if (path.includes('profile.html')) pageId = 'profile';
    else if (path.includes('login.html')) pageId = 'login';
    else if (path.includes('signup.html')) pageId = 'signup';
    else pageId = 'chat';

    switch (pageId) {
        case 'chat':
            // Chat page is already set up
            break;
        case 'models':
            if (typeof renderModelSelection === 'function') renderModelSelection();
            if (typeof renderFilterControls === 'function') renderFilterControls();
            break;
        case 'compare':
            if (typeof renderQueryModeSelector === 'function') renderQueryModeSelector();
            if (typeof renderQuerySettings === 'function') renderQuerySettings();
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
 * Toggle left sidebar
 */
function toggleLeftSidebar() {
    const sidebar = document.getElementById('leftSidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
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
                    <span class="selected-models-toggle">▼</span>
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