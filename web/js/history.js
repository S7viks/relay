// Query History Management Module
// Handles saving, loading, and displaying query history

/**
 * Save query to history
 */
function saveToHistory(query, response, config) {
    addToHistory(query, response, config);
}

/**
 * Load history from state
 */
function loadHistory() {
    return getHistory();
}

/**
 * Render history (for history page or sidebar)
 */
function renderHistory() {
    const history = loadHistory();
    const historyContent = document.getElementById('historyContent');
    const sidebar = document.getElementById('historySidebar');
    
    // Render in history page
    if (historyContent) {
        renderHistoryPage(history);
    }
    
    // Also update sidebar if it exists
    if (sidebar) {
        renderHistorySidebar(history);
    }
}

// Track how many items to show in sidebar
let sidebarHistoryLimit = 10;

/**
 * Render history in sidebar
 */
function renderHistorySidebar(history) {
    const recentQueries = document.getElementById('recentQueries');
    if (!recentQueries) return;

    if (history.length === 0) {
        recentQueries.innerHTML = '<div class="no-recent-queries">No recent queries</div>';
        return;
    }

    const itemsToShow = Math.min(sidebarHistoryLimit, history.length);
    const hasMore = history.length > sidebarHistoryLimit;

    let html = '';
    history.slice(0, itemsToShow).forEach(item => {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const promptPreview = item.prompt.length > 50 
            ? item.prompt.substring(0, 50) + '...' 
            : item.prompt;
        const modelCount = item.response ? Object.keys(item.response).length : 0;

        html += `
            <div class="recent-query-item" onclick="replayQueryFromSidebar('${item.id}')">
                <div class="recent-query-content">
                    <div class="recent-query-title">${escapeHtml(promptPreview)}</div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <div class="recent-query-time">${timeStr}</div>
                        ${modelCount > 0 ? `<div style="font-size: 10px; color: var(--text-tertiary);">• ${modelCount} model${modelCount > 1 ? 's' : ''}</div>` : ''}
                    </div>
                </div>
                <button class="recent-query-action-btn" onclick="event.stopPropagation(); deleteHistoryItem('${item.id}')" title="Delete" aria-label="Delete">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 5l10 10M15 5l-10 10"/>
                    </svg>
                </button>
            </div>
        `;
    });

    // Add "Load More" button if there are more items
    if (hasMore) {
        const remaining = history.length - itemsToShow;
        html += `
            <div class="load-more-container">
                <button class="load-more-btn" onclick="loadMoreHistoryItems()">
                    Load ${remaining} more
                </button>
            </div>
        `;
    }

    recentQueries.innerHTML = html;
}

/**
 * Load more history items in sidebar
 */
function loadMoreHistoryItems() {
    sidebarHistoryLimit += 20; // Increase by 20 each time
    renderHistory();
}

/**
 * Replay query from sidebar
 */
function replayQueryFromSidebar(itemId) {
    replayQuery(itemId);
}

/**
 * Render history in history page
 */
function renderHistoryPage(history) {
    const historyContent = document.getElementById('historyContent');
    if (!historyContent) return;
    
    if (history.length === 0) {
        historyContent.innerHTML = '<p style="text-align:center;color:var(--text-tertiary);padding:40px;">No query history yet</p>';
        return;
    }

    let html = '';
    history.forEach(item => {
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleString();
        const promptPreview = item.prompt.length > 150 
            ? item.prompt.substring(0, 150) + '...' 
            : item.prompt;
        
        // Get response preview
        let responsePreview = '';
        let modelCount = 0;
        if (item.response && typeof item.response === 'object') {
            modelCount = Object.keys(item.response).length;
            // Get first response text for preview
            const firstResponse = Object.values(item.response)[0];
            if (firstResponse && (firstResponse.response || firstResponse.data)) {
                const responseText = firstResponse.response || firstResponse.data || '';
                responsePreview = responseText.length > 100 
                    ? responseText.substring(0, 100) + '...' 
                    : responseText;
            }
        }

        html += `
            <div class="history-item-modern" onclick="replayQuery('${item.id}')">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;margin-bottom:8px;color:var(--text-primary);font-size:14px;line-height:1.4;">${escapeHtml(promptPreview)}</div>
                        ${responsePreview ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.5;padding:8px;background:rgba(255,255,255,0.02);border-radius:6px;border-left:2px solid var(--accent-primary);">${escapeHtml(responsePreview)}</div>` : ''}
                        <div style="display:flex;align-items:center;gap:12px;font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono);">
                            <span>${timeStr}</span>
                            <span>•</span>
                            <span>${item.queryMode || 'compare'}</span>
                            ${modelCount > 0 ? `<span>•</span><span>${modelCount} model${modelCount > 1 ? 's' : ''}</span>` : ''}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;flex-shrink:0;margin-left:16px;">
                        <button onclick="event.stopPropagation();replayQuery('${item.id}')" style="padding:6px 12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-size:12px;color:var(--text-primary);transition:all 0.2s ease;">Replay</button>
                        <button onclick="event.stopPropagation();deleteHistoryItem('${item.id}')" style="padding:6px 12px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:6px;cursor:pointer;font-size:12px;color:var(--error-color);transition:all 0.2s ease;">Delete</button>
                    </div>
                </div>
            </div>
        `;
    });

    historyContent.innerHTML = html;
}

/**
 * Replay a query from history
 */
function replayQuery(itemId) {
    const history = loadHistory();
    const item = history.find(h => h.id === itemId);
    
    if (!item) {
        showToast('error', 'History item not found');
        return;
    }

    // Reset chat transcript before loading history item
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.innerHTML = '';
    }
    if (typeof clearChatStatus === 'function') {
        clearChatStatus();
    }
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'block';
    }

    // Set prompt
    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
        promptInput.value = item.prompt;
        if (typeof autoResizeTextarea === 'function') {
            autoResizeTextarea(promptInput);
        }
        if (typeof updateCharCount === 'function') {
            updateCharCount();
        }
    }

    // Set settings
    if (item.config) {
        const settings = item.config;
        if (settings.max_tokens) {
            const maxTokensInput = document.getElementById('maxTokensInput');
            if (maxTokensInput) maxTokensInput.value = settings.max_tokens;
        }
        if (settings.temperature !== undefined) {
            const tempInput = document.getElementById('temperatureInput');
            if (tempInput) tempInput.value = settings.temperature;
        }
        if (settings.strategy) {
            const strategySelect = document.getElementById('strategySelect');
            if (strategySelect) strategySelect.value = settings.strategy;
        }
        if (settings.task) {
            const taskSelect = document.getElementById('taskSelect');
            if (taskSelect) taskSelect.value = settings.task;
        }
    }

    // Set query mode
    if (item.queryMode) {
        setQueryMode(item.queryMode);
    }

    // Switch to chat page
    if (typeof switchPage === 'function') {
        switchPage('chat');
    }

    // Show info message
    showToast('info', 'Query loaded', 'Click send to execute');
}

/**
 * Delete history item
 */
function deleteHistoryItem(itemId) {
    removeHistoryItem(itemId);
    renderHistory();
    showToast('success', 'History item deleted');
}

/**
 * Clear all history
 */
function clearAllHistory() {
    if (confirm('Are you sure you want to clear all query history?')) {
        clearHistory();
        renderHistory();
        showToast('success', 'History cleared');
    }
}

/**
 * Export history as JSON
 */
function exportHistory() {
    const history = loadHistory();
    const dataStr = JSON.stringify(history, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gaiol-history-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'History exported');
}

/**
 * Toggle history sidebar
 */
function toggleHistorySidebar() {
    const sidebar = document.getElementById('historySidebar');
    if (sidebar) {
        sidebar.classList.toggle('open');
    }
}

/**
 * Replay query from sidebar
 */
function replayQueryFromSidebar(itemId) {
    replayQuery(itemId);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
