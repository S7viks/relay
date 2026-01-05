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
        icon = '💬',
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
                            <kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd>
                        </div>
                        <div class="shortcut-description">Global search</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd><kbd>Enter</kbd>
                        </div>
                        <div class="shortcut-description">Send message</div>
                    </div>
                    <div class="shortcut-item">
                        <div class="shortcut-keys">
                            <kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd><kbd>/</kbd>
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
                            <kbd>${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}</kbd><kbd>B</kbd>
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
