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
            voiceBtn.textContent = '🎤';
            voiceBtn.style.background = '';
            showToast('success', 'Voice input captured', transcript.substring(0, 50) + '...');
        };
        
        recognition.onerror = function(event) {
            isListening = false;
            voiceBtn.textContent = '🎤';
            voiceBtn.style.background = '';
            showToast('error', 'Voice recognition error', event.error);
        };
        
        recognition.onend = function() {
            isListening = false;
            voiceBtn.textContent = '🎤';
            voiceBtn.style.background = '';
        };
        
        voiceBtn.addEventListener('click', function() {
            if (!isListening) {
                try {
                    recognition.start();
                    isListening = true;
                    voiceBtn.textContent = '🔴';
                    voiceBtn.style.background = 'var(--error-color)';
                    showToast('info', 'Listening...', 'Speak your prompt');
                } catch (error) {
                    showToast('error', 'Voice recognition not available', 'Please use a supported browser');
                }
            } else {
                recognition.stop();
                isListening = false;
                voiceBtn.textContent = '🎤';
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
 * Setup global search (⌘K / Ctrl+K)
 */
function setupGlobalSearch() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;
    
    // Keyboard shortcut handler
    document.addEventListener('keydown', function(e) {
        // ⌘K on Mac, Ctrl+K on Windows/Linux
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
