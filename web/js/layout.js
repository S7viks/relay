// Shared Layout Module
// Renders common UI elements (top bar, sidebars) across all pages

/**
 * Render top bar
 */
function renderTopBar(currentPageName = 'Chat') {
    return `
        <div class="top-bar glass-panel">
            <div class="top-bar-left">
                <button class="icon-btn" onclick="toggleLeftSidebar()" aria-label="Toggle menu">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                </button>
                <div class="breadcrumb">
                    <span id="currentPage" class="nexus-glow-text">${currentPageName}</span>
                </div>
            </div>
            <div class="top-bar-right">
                <div class="status-indicator">
                    <span id="healthStatus" class="health-status"></span>
                    <span class="status-text">NETWORK ONLINE</span>
                </div>
                <button class="icon-btn" onclick="window.location.href='/settings.html'" aria-label="Settings">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v2M12 20v2M22 12h-2M4 12H2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M19.07 19.07l-1.41-1.41M6.34 6.34l-1.41-1.41"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

/**
 * Render left sidebar
 */
function renderLeftSidebar(currentPage = 'chat') {
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : false;
    
    return `
        <div class="left-sidebar" id="leftSidebar">
            <div class="sidebar-header">
                <div class="logo">
                    <span class="logo-text">GAIOL</span>
                </div>
            </div>

            <div class="sidebar-search">
                <input type="text" placeholder="Search..." id="globalSearch" class="search-input">
            </div>

            <nav class="sidebar-nav">
                <a href="/index.html" class="nav-item ${currentPage === 'chat' ? 'active' : ''}" data-page="chat">
                    <span class="nav-text">Chat</span>
                </a>
                <a href="/models.html" class="nav-item ${currentPage === 'models' ? 'active' : ''}" data-page="models">
                    <span class="nav-text">Models</span>
                </a>
                <a href="/compare.html" class="nav-item ${currentPage === 'compare' ? 'active' : ''}" data-page="compare">
                    <span class="nav-text">Compare</span>
                </a>
                <a href="/history.html" class="nav-item ${currentPage === 'history' ? 'active' : ''}" data-page="history">
                    <span class="nav-text">History</span>
                </a>
                <a href="/settings.html" class="nav-item ${currentPage === 'settings' ? 'active' : ''}" data-page="settings">
                    <span class="nav-text">Settings</span>
                </a>
                <div class="nav-divider"></div>
                <a href="/profile.html" class="nav-item ${currentPage === 'profile' ? 'active' : ''}" id="profileNavItem" data-page="profile" style="display: ${isAuth ? 'flex' : 'none'};">
                    <span class="nav-text">Profile</span>
                </a>
                <a href="/login.html" class="nav-item ${currentPage === 'login' ? 'active' : ''}" id="loginNavItem" data-page="login" style="display: ${isAuth ? 'none' : 'flex'};">
                    <span class="nav-text">Sign In</span>
                </a>
            </nav>

            <div class="sidebar-footer">
                <button class="theme-btn" onclick="setTheme('light')" aria-label="Light theme">Light</button>
                <button class="theme-btn" onclick="setTheme('dark')" aria-label="Dark theme">Dark</button>
            </div>
        </div>
    `;
}

/**
 * Render right sidebar
 */
function renderRightSidebar() {
    return `
        <div class="right-sidebar glass-panel" id="rightSidebar">
            <div class="sidebar-header-right">
                <h3 style="font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; color: var(--accent-primary);">CORE OPERATIONAL INTEL</h3>
                <button class="icon-btn-small sidebar-toggle-btn" id="rightSidebarToggle" onclick="toggleRightSidebar()" aria-label="Toggle sidebar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sidebar-toggle-icon">
                        <path d="M15 18l-6-6 6-6"/>
                    </svg>
                </button>
            </div>

            <!-- Quick Actions -->
            <div class="sidebar-section collapsible" data-section="quickActions">
                <div class="sidebar-section-header" onclick="toggleSection('quickActions')">
                    <h4>Quick Actions</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="quickActionsContent">
                    <div class="quick-actions-grid">
                        <button class="quick-action-item" onclick="handleNewChat()" title="New Chat">
                            <span>New Chat</span>
                        </button>
                        <button class="quick-action-item" onclick="handleClearSelection()" title="Clear Selection">
                            <span>Clear Selection</span>
                        </button>
                        <button class="quick-action-item" onclick="handleExportResults()" title="Export Results">
                            <span>Export</span>
                        </button>
                        <button class="quick-action-item" onclick="handleCopyAllResponses()" title="Copy All">
                            <span>Copy All</span>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Active Query Status -->
            <div class="sidebar-section" id="activeQuerySection" style="display: none;">
                <div class="sidebar-section-header">
                    <h4>Query Status</h4>
                </div>
                <div class="sidebar-section-content" id="activeQueryContent"></div>
            </div>

            <!-- Quick Settings -->
            <div class="sidebar-section collapsible" data-section="quickSettings">
                <div class="sidebar-section-header" onclick="toggleSection('quickSettings')">
                    <h4>Quick Settings</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="quickSettingsContent">
                    <div class="setting-control">
                        <label>Temperature</label>
                        <input type="range" id="quickTemperature" min="0" max="2" step="0.1" value="0.7" oninput="updateQuickTemp(this.value)">
                        <span class="setting-value" id="quickTempValue">0.7</span>
                    </div>
                    <div class="setting-control">
                        <label>Max Tokens</label>
                        <input type="number" id="quickMaxTokens" min="50" max="4096" value="200" oninput="updateQuickTokens(this.value)">
                    </div>
                    <div class="setting-control">
                        <label>Strategy</label>
                        <select id="quickStrategy" onchange="updateQuickStrategy(this.value)">
                            <option value="free_only">Free Only</option>
                            <option value="lowest_cost">Lowest Cost</option>
                            <option value="highest_quality">Highest Quality</option>
                            <option value="balanced">Balanced</option>
                        </select>
                    </div>
                    <div class="setting-control">
                        <label>Task</label>
                        <select id="quickTask" onchange="updateQuickTask(this.value)">
                            <option value="generate">Generate</option>
                            <option value="analyze">Analyze</option>
                            <option value="code">Code</option>
                            <option value="summarize">Summarize</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Selected Models -->
            <div class="sidebar-section collapsible" data-section="selectedModels">
                <div class="sidebar-section-header" onclick="toggleSection('selectedModels')">
                    <h4>Selected Models</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="selectedModelsContent">
                    <div id="selectedModelsDropdown" class="selected-models-section"></div>
                </div>
            </div>

            <!-- Model Recommendations -->
            <div class="sidebar-section collapsible" data-section="recommendations">
                <div class="sidebar-section-header" onclick="toggleSection('recommendations')">
                    <h4>Recommendations</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="recommendationsContent">
                    <div id="modelRecommendations"></div>
                </div>
            </div>

            <!-- Cost Tracker -->
            <div class="sidebar-section collapsible" data-section="costTracker">
                <div class="sidebar-section-header" onclick="toggleSection('costTracker')">
                    <h4>Cost Tracker</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="costTrackerContent">
                    <div class="cost-display">
                        <div class="cost-item">
                            <span class="cost-label">Est. Cost</span>
                            <span class="cost-value" id="estimatedCost">$0.00</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Today</span>
                            <span class="cost-value" id="sessionCost">$0.00</span>
                        </div>
                        <div class="cost-item">
                            <span class="cost-label">Per Query</span>
                            <span class="cost-value" id="perQueryCost">$0.00</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Session Statistics -->
            <div class="sidebar-section collapsible" data-section="sessionStats">
                <div class="sidebar-section-header" onclick="toggleSection('sessionStats')">
                    <h4>Session Stats</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="sessionStatsContent">
                    <div class="stats-grid">
                        <div class="stat-mini">
                            <div class="stat-mini-value" id="queriesToday">0</div>
                            <div class="stat-mini-label">Queries</div>
                        </div>
                        <div class="stat-mini">
                            <div class="stat-mini-value" id="tokensUsed">0</div>
                            <div class="stat-mini-label">Tokens</div>
                        </div>
                        <div class="stat-mini">
                            <div class="stat-mini-value" id="avgResponseTime">-</div>
                            <div class="stat-mini-label">Avg Time</div>
                        </div>
                        <div class="stat-mini">
                            <div class="stat-mini-value" id="modelsUsedCount">0</div>
                            <div class="stat-mini-label">Models</div>
                        </div>
                    </div>
                    <button class="btn-mini" onclick="resetSessionStats()">Reset</button>
                </div>
            </div>

            <!-- Model Performance -->
            <div class="sidebar-section collapsible" data-section="modelPerformance">
                <div class="sidebar-section-header" onclick="toggleSection('modelPerformance')">
                    <h4>Performance</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="modelPerformanceContent">
                    <div id="modelPerformanceList"></div>
                </div>
            </div>

            <!-- Favorites -->
            <div class="sidebar-section collapsible" data-section="favorites">
                <div class="sidebar-section-header" onclick="toggleSection('favorites')">
                    <h4>Favorites</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="favoritesContent">
                    <div id="favoritesList"></div>
                    <button class="btn-mini" onclick="saveCurrentAsFavorite()">Save Current</button>
                </div>
            </div>

            <!-- Filter Presets -->
            <div class="sidebar-section collapsible" data-section="filterPresets">
                <div class="sidebar-section-header" onclick="toggleSection('filterPresets')">
                    <h4>Filter Presets</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="filterPresetsContent">
                    <div id="filterPresetsList"></div>
                    <button class="btn-mini" onclick="saveCurrentFilterPreset()">Save Preset</button>
                </div>
            </div>

            <!-- Prompt Templates -->
            <div class="sidebar-section collapsible" data-section="promptTemplates">
                <div class="sidebar-section-header" onclick="toggleSection('promptTemplates')">
                    <h4>Templates</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="promptTemplatesContent">
                    <div id="promptTemplatesList"></div>
                </div>
            </div>

            <!-- Recent Queries -->
            <div class="sidebar-section collapsible" data-section="recentQueries">
                <div class="sidebar-section-header" onclick="toggleSection('recentQueries')">
                    <h4>Recent</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="recentQueriesContent">
                    <div id="recentQueries" class="recent-queries"></div>
                </div>
            </div>

            <!-- Activity Feed -->
            <div class="sidebar-section collapsible" data-section="activityFeed">
                <div class="sidebar-section-header" onclick="toggleSection('activityFeed')">
                    <h4>Activity</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="activityFeedContent">
                    <div id="activityFeedList"></div>
                </div>
            </div>

            <!-- Export Options -->
            <div class="sidebar-section collapsible" data-section="exportOptions">
                <div class="sidebar-section-header" onclick="toggleSection('exportOptions')">
                    <h4>Export</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="exportOptionsContent">
                    <div class="export-buttons">
                        <button class="btn-mini" onclick="exportAsJSON()">JSON</button>
                        <button class="btn-mini" onclick="exportAsMarkdown()">Markdown</button>
                        <button class="btn-mini" onclick="exportAsCSV()">CSV</button>
                    </div>
                </div>
            </div>

            <!-- Keyboard Shortcuts -->
            <div class="sidebar-section collapsible" data-section="shortcuts">
                <div class="sidebar-section-header" onclick="toggleSection('shortcuts')">
                    <h4>Shortcuts</h4>
                    <span class="section-toggle">▼</span>
                </div>
                <div class="sidebar-section-content" id="shortcutsContent">
                    <div id="keyboardShortcutsList"></div>
                </div>
            </div>

            <!-- Stats Summary -->
            <div class="sidebar-section">
                <div class="sidebar-stats">
                    <div class="stat-item">
                        <div class="stat-value" id="totalModelsCount">-</div>
                        <div class="stat-label">Total</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="freeModelsCount">-</div>
                        <div class="stat-label">Free</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" id="selectedModelsCount">0</div>
                        <div class="stat-label">Selected</div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render common UI elements (loading overlay, toast container, floating toggle)
 */
function renderCommonUI() {
    return `
        <!-- Loading Overlay -->
        <div id="loadingOverlay" class="loading-overlay">
            <div class="spinner-large"></div>
            <p id="loadingMessage" class="loading-message">Querying AI models...</p>
        </div>

        <!-- Toast Container -->
        <div id="toastContainer" class="toast-container"></div>

        <!-- Floating Right Sidebar Toggle (shown when sidebar is collapsed) -->
        <button class="right-sidebar-toggle-floating" id="rightSidebarToggleFloating" onclick="toggleRightSidebar()" aria-label="Toggle sidebar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 15l5-5-5-5M6 5l-5 5 5 5"/>
            </svg>
        </button>
    `;
}

/**
 * Initialize layout for a page
 */
function initializeLayout(pageName, currentPageId) {
    // Skip layout for auth pages
    const isAuthPage = document.querySelector('.auth-page');
    if (isAuthPage) {
        return; // Auth pages don't need layout
    }
    
    // Insert top bar at the beginning of body
    document.body.insertAdjacentHTML('afterbegin', renderTopBar(pageName));
    
    // Get app container
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) {
        console.error('app-container not found');
        return;
    }
    
    // Insert left sidebar INSIDE app-container, before main-content
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.insertAdjacentHTML('beforebegin', renderLeftSidebar(currentPageId));
    } else {
        // If no main-content, insert at the beginning of app-container
        appContainer.insertAdjacentHTML('afterbegin', renderLeftSidebar(currentPageId));
    }
    
    // Insert right sidebar INSIDE app-container, after main-content
    if (mainContent) {
        mainContent.insertAdjacentHTML('afterend', renderRightSidebar());
    } else {
        // If no main-content, insert at the end of app-container
        appContainer.insertAdjacentHTML('beforeend', renderRightSidebar());
    }
    
    // Insert common UI (loading overlay, toast container, floating toggle)
    document.body.insertAdjacentHTML('beforeend', renderCommonUI());
    
    // Initialize right sidebar state (defer to ensure navigation.js is loaded)
    setTimeout(() => {
        if (typeof initializeRightSidebar === 'function') {
            initializeRightSidebar();
        }
    }, 100);
    
    // Update auth nav items (defer to ensure auth.js is loaded)
    setTimeout(() => {
        if (typeof updateAuthNavItems === 'function') {
            updateAuthNavItems();
        }
    }, 200);
}

// Make functions globally available
window.renderTopBar = renderTopBar;
window.renderLeftSidebar = renderLeftSidebar;
window.renderRightSidebar = renderRightSidebar;
window.renderCommonUI = renderCommonUI;
window.initializeLayout = initializeLayout;
