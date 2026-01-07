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
                <button class="icon-btn tooltip" onclick="if(typeof openShortcutsModal==='function')openShortcutsModal()" aria-label="Keyboard Shortcuts" data-tooltip="Keyboard Shortcuts (⌘/ or Ctrl+/)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <path d="M9 9h6M9 15h6M12 9v6"/>
                    </svg>
                </button>
                <button class="icon-btn" onclick="window.location.href='/settings.html'" aria-label="Settings">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M12 2v2M12 20v2M22 12h-2M4 12H2M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M19.07 19.07l-1.41-1.41M6.34 6.34l-1.41-1.41"/>
                    </svg>
                </button>
                <button class="profile-btn-top" id="profileBtnTop" onclick="window.location.href='/profile.html'" aria-label="Profile" style="display: none;">
                    <span class="profile-avatar-top" id="profileAvatarTop">U</span>
                </button>
                <a href="/login.html" class="profile-btn-top login-link-top" id="loginLinkTop" aria-label="Sign In" style="display: none;">
                    <span class="login-text-top">Sign In</span>
                </a>
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

            <div class="sidebar-library">
                ${renderLibrarySection()}
            </div>

            <div class="sidebar-analysis">
                ${renderAnalysisSection()}
            </div>

            <div class="sidebar-footer">
                <button class="theme-btn" onclick="setTheme('light')" aria-label="Light theme">Light</button>
                <button class="theme-btn" onclick="setTheme('dark')" aria-label="Dark theme">Dark</button>
            </div>
        </div>
    `;
}

/**
 * Render Library Section (Favorites and Templates)
 */
function renderLibrarySection() {
    return `
        <div class="sidebar-section-compact collapsible" data-section="library">
            <div class="sidebar-section-header-compact" onclick="toggleSection('library')">
                <span class="section-title-compact">LIBRARY</span>
                <span class="section-toggle-compact">▼</span>
            </div>
            <div class="sidebar-section-content-compact" id="libraryContent">
                <div class="library-subsection">
                    <h5>Favorites</h5>
                    <div id="favoritesList" class="compact-list"></div>
                </div>
                <div class="library-subsection">
                    <h5>Templates</h5>
                    <div id="promptTemplatesList" class="compact-list"></div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Analysis Section (Activity Feed)
 */
function renderAnalysisSection() {
    return `
        <div class="sidebar-section-compact collapsible" data-section="analysis">
            <div class="sidebar-section-header-compact" onclick="toggleSection('analysis')">
                <span class="section-title-compact">ANALYSIS</span>
                <span class="section-toggle-compact">▼</span>
            </div>
            <div class="sidebar-section-content-compact" id="analysisContent">
                <div id="activityFeedList" class="activity-feed-compact"></div>
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
                <div class="sidebar-header-content">
                    <div class="sidebar-header-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                        </svg>
                    </div>
                    <h3 class="sidebar-header-title">SYSTEM INTEL</h3>
                </div>
                <button class="sidebar-toggle-btn" id="rightSidebarToggle" onclick="toggleRightSidebar()" aria-label="Toggle sidebar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="sidebar-toggle-icon">
                        <path d="M15 18l-6-6 6-6"/>
                    </svg>
                </button>
            </div>

            <!-- Active Query Status -->
            <div class="sidebar-section" id="activeQuerySection" style="display: none;">
                <div class="sidebar-section-header">
                    <h4>Query Status</h4>
                </div>
                <div class="sidebar-section-content" id="activeQueryContent"></div>
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

            <!-- Stats Summary -->
            <div class="sidebar-stats">
                <div class="stat-item">
                    <div class="stat-value" id="totalModelsCount">-</div>
                    <div class="stat-label">Total</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" id="freeModelsCount">-</div>
                    <div class="stat-label">Free</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render Chat Context Bar (The new header area for chat)
 */
function renderChatContextBar() {
    return `
        <div class="chat-context-bar glass-panel">
            <div class="context-left">
                <div class="context-item">
                    <span class="context-label">AUTOMATIC MODE</span>
                    <div class="selected-models-preview">
                        <span class="models-count">Models selected automatically</span>
                    </div>
                </div>
            </div>
            <div class="context-right">
                <div class="context-controls">
                    <div class="control-group">
                        <label title="Temperature">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
                            </svg>
                        </label>
                        <input type="range" id="quickTemperature" min="0" max="2" step="0.1" value="0.7" oninput="updateQuickTemp(this.value)" class="context-range">
                        <span id="quickTempValue" class="context-value">0.7</span>
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

    // Insert chat context bar at the beginning of main-content
    if (mainContent && currentPageId === 'chat') {
        mainContent.insertAdjacentHTML('afterbegin', renderChatContextBar());
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
        // Update top bar profile button
        updateTopBarProfile();
    }, 200);
}

/**
 * Update top bar profile button based on auth state
 */
function updateTopBarProfile() {
    const profileBtn = document.getElementById('profileBtnTop');
    const loginLink = document.getElementById('loginLinkTop');
    const profileAvatar = document.getElementById('profileAvatarTop');

    if (!profileBtn || !loginLink) return;

    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : false;

    if (isAuth) {
        // Show profile button, hide login link
        profileBtn.style.display = 'flex';
        loginLink.style.display = 'none';

        // Update avatar with user initial if user is already loaded
        if (profileAvatar && typeof window.currentUser !== 'undefined' && window.currentUser) {
            const user = window.currentUser;
            const initial = (user.email?.[0] || 'U').toUpperCase();
            profileAvatar.textContent = initial;
        } else if (profileAvatar) {
            // User not loaded yet, show default
            profileAvatar.textContent = 'U';
        }
    } else {
        // Show login link, hide profile button
        profileBtn.style.display = 'none';
        loginLink.style.display = 'flex';
    }
}

// Make functions globally available
window.renderTopBar = renderTopBar;
window.renderLeftSidebar = renderLeftSidebar;
window.renderRightSidebar = renderRightSidebar;
window.renderLibrarySection = renderLibrarySection;
window.renderAnalysisSection = renderAnalysisSection;
window.renderChatContextBar = renderChatContextBar;
window.renderCommonUI = renderCommonUI;
window.initializeLayout = initializeLayout;
window.updateTopBarProfile = updateTopBarProfile;