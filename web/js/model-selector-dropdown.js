// Toggle model selector dropdown
function toggleModelSelector() {
    const dropdown = document.getElementById('modelSelectorDropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display !== 'none';
    dropdown.style.display = isVisible ? 'none' : 'block';

    // If opening, render model selection
    if (!isVisible) {
        renderModelSelectorDropdown();
    }
}

// Render model selection in dropdown
function renderModelSelectorDropdown() {
    const content = document.getElementById('modelSelectorContent');
    if (!content) return;

    const models = typeof getModels === 'function' ? getModels() : [];
    const selectedModelIds = typeof getSelectedModels === 'function' ? getSelectedModels() : [];

    if (models.length === 0) {
        content.innerHTML = '<p style="padding: var(--space-md); color: var(--text-tertiary); text-align: center;">No models available</p>';
        return;
    }

    // Render simple model list with just names
    content.innerHTML = models.map(model => {
        const modelId = model.id || model.ID;
        const displayName = model.display_name || model.DisplayName || modelId;
        const isSelected = selectedModelIds.includes(modelId);

        return `
            <div class="model-selector-item ${isSelected ? 'selected' : ''}" onclick="toggleModelSelectionUI('${modelId}'); event.stopPropagation();">
                <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();">
                <span class="model-selector-name">${escapeHtml(displayName)}</span>
            </div>
        `;
    }).join('');

    // Update the selected models count
    updateSelectedModelsCount();
}

// Update selected models count
function updateSelectedModelsCount() {
    const countEl = document.getElementById('selectedModelsCount');
    if (!countEl) return;

    const selectedModels = getSelectedModels();
    const count = selectedModels ? selectedModels.length : 0;

    countEl.textContent = count === 0 ? 'No models selected' : `${count} selected`;
}

// Make functions globally available
window.toggleModelSelector = toggleModelSelector;
window.renderModelSelectorDropdown = renderModelSelectorDropdown;
window.updateSelectedModelsCount = updateSelectedModelsCount;
