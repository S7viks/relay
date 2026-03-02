/**
 * ReasoningComponent
 * Handles rendering the 'Thought Process' inside chat bubbles
 */
class ReasoningComponent {
    constructor(containerId, sessionID) {
        this.container = document.getElementById(containerId);
        this.sessionID = sessionID;
        this.steps = [];
        this.activeSteps = new Set();
        this.isCollapsed = false;

        this.render();
        this.setupListeners();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="thought-process-container">
                <div class="thought-header">
                    <div class="thought-header-left">
                        <span class="status-dot"></span>
                        <h4>Thought Process</h4>
                    </div>
                    <div class="thought-header-right">
                        <div class="session-cost-badge" style="display: none;">$0.000</div>
                        <span class="toggle-icon">▲</span>
                    </div>
                </div>
                <div class="thought-content">
                    <div class="steps-timeline-mini"></div>
                    <div class="thought-main">
                        <div class="model-grid-mini"></div>
                        <div class="step-detail-mini">
                            Initializing reasoning engine...
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.dom = {
            content: this.container.querySelector('.thought-content'),
            header: this.container.querySelector('.thought-header'),
            toggleIcon: this.container.querySelector('.toggle-icon'),
            timeline: this.container.querySelector('.steps-timeline-mini'),
            modelGrid: this.container.querySelector('.model-grid-mini'),
            detail: this.container.querySelector('.step-detail-mini'),
            costBadge: this.container.querySelector('.session-cost-badge')
        };
    }

    setupListeners() {
        this.dom.header.addEventListener('click', () => {
            this.isCollapsed = !this.isCollapsed;
            this.dom.content.classList.toggle('collapsed', this.isCollapsed);
            this.dom.toggleIcon.textContent = this.isCollapsed ? '▼' : '▲';
        });
    }

    onEvent(event) {
        const { type, payload } = event;

        switch (type) {
            case 'decompose_start':
                this.updateDetail('Breaking down the prompt into logical steps...');
                break;
            case 'decompose_end':
                this.steps = payload.steps;
                this.renderTimeline();
                this.updateDetail('Prompt decomposed into ' + this.steps.length + ' steps.');
                break;
            case 'step_start':
                this.activeSteps.add(payload.step_index);
                const taskType = payload.task_type || 'analyze';
                this.updateTimeline();

                if (this.activeSteps.size > 1) {
                    this.updateDetail(`Executing Parallel Phase: ${this.activeSteps.size} Concurrent Tasks...`);
                    this.container.querySelector('.thought-process-container').classList.add('high-speed');
                } else {
                    this.updateDetail(`[${taskType.toUpperCase()}] ${payload.title}`);
                }

                this.renderTaskBadge(taskType);
                if (this.activeSteps.size === 1) {
                    this.dom.modelGrid.innerHTML = '';
                }
                break;
            case 'rag':
                this.showRAGDetails(payload);
                break;
            case 'model_response':
                this.renderModelOutput(payload);
                break;
            case 'step_end':
                this.activeSteps.delete(payload.index);
                this.markStepCompleted(payload);
                this.updateTotalCost(payload.total_cost);

                if (this.activeSteps.size === 0) {
                    this.container.querySelector('.thought-process-container').classList.remove('high-speed');
                }
                break;
            case 'beam_update':
                this.showBeamUpdate(payload);
                this.updateTotalCost(payload.total_cost);
                break;
            case 'consensus':
                this.showConsensus(payload);
                break;
            case 'reasoning_end':
                this.setFinalStatus();
                break;
            case 'error':
                this.updateDetail('Error: ' + payload, true);
                break;
        }
    }

    updateDetail(text, isError = false) {
        if (this.dom.detail) {
            this.dom.detail.textContent = text;
            this.dom.detail.style.color = isError ? 'var(--error-color)' : 'var(--text-tertiary)';
        }
    }

    renderTimeline() {
        if (!this.dom.timeline) return;
        this.dom.timeline.innerHTML = this.steps.map((step, i) => `
            <div class="step-pill" data-index="${i}" title="${step.objective}">
                ${i + 1}. ${step.title}
            </div>
        `).join('');
    }

    updateTimeline() {
        const pills = this.dom.timeline.querySelectorAll('.step-pill');
        pills.forEach((pill, i) => {
            pill.classList.toggle('active', this.activeSteps.has(i));
        });
    }

    renderModelOutput(payload) {
        if (!this.dom.modelGrid) return;

        const outputDiv = document.createElement('div');
        outputDiv.className = 'model-output-mini';

        const costStr = payload.cost ? `$${payload.cost.toFixed(4)}` : '';
        const tokenStr = payload.tokens_used ? `${payload.tokens_used} tokens` : '';
        const usageInfo = [tokenStr, costStr].filter(x => x).join(' • ');

        outputDiv.innerHTML = `
            <div class="model-name-row" style="display: flex; justify-content: space-between; align-items: baseline;">
                <div class="model-name" style="font-weight: 600; font-size: 11px;">${payload.model_id.split('/').pop()}</div>
                <div class="model-score" style="font-size: 10px; color: var(--accent-color); font-weight: 700;"></div>
            </div>
            <div class="model-meta-info" style="font-size: 9px; color: var(--text-tertiary); line-height: 1.2;">
                ${usageInfo}
            </div>
        `;
        this.dom.modelGrid.appendChild(outputDiv);
    }

    updateTotalCost(cost) {
        if (!this.dom.costBadge || cost === undefined) return;
        this.dom.costBadge.textContent = `$${cost.toFixed(4)}`;
        this.dom.costBadge.style.display = 'block';

        // Cost Alert logic
        if (cost > 0.04) { // Warning at 80% of default budget ($0.05)
            this.dom.costBadge.style.borderColor = 'var(--warning-color, orange)';
            this.dom.costBadge.style.color = 'var(--warning-color, orange)';
        }
    }


    showBeamUpdate(payload) {
        this.updateDetail(`Beam Search: Exploring ${payload.active_paths} paths. Best score: ${(payload.best_score * 100).toFixed(0)}%`);
    }

    markStepCompleted(payload) {
        const pills = this.dom.timeline.querySelectorAll('.step-pill');
        const completedPill = pills[payload.index];
        if (completedPill) {
            completedPill.classList.remove('active');
            completedPill.classList.add('completed');
        }

        // Highlight winner in grid
        if (payload.selected_output) {
            const winnerModelId = payload.selected_output.model_id;
            const cards = this.dom.modelGrid.querySelectorAll('.model-output-mini');
            cards.forEach(card => {
                const name = card.querySelector('.model-name').textContent;
                if (winnerModelId.includes(name)) {
                    card.classList.add('winner');
                    const score = payload.selected_output.scores ? (payload.selected_output.scores.overall * 100).toFixed(0) + '%' : 'Match';
                    card.querySelector('.model-score').textContent = score;
                }
            });
        }
    }

    renderTaskBadge(type) {
        const badge = document.createElement('span');
        badge.className = `task-badge task-badge-${type}`;
        badge.textContent = type.toUpperCase();

        // Insert into detail as a prefix or separate element
        if (this.dom.detail) {
            this.dom.detail.prepend(badge);
        }
    }

    showRAGDetails(docs) {
        if (!docs || docs.length === 0) return;

        const ragDiv = document.createElement('div');
        ragDiv.className = 'rag-context-mini';
        ragDiv.innerHTML = `
            <div class="rag-header">
                <span class="rag-icon">📚</span>
                <span>Context retrieved (${docs.length} docs)</span>
            </div>
            <div class="rag-docs">
                ${docs.map(doc => `
                    <div class="rag-doc-pill" title="${doc.content.substring(0, 500)}...">
                        ${doc.metadata?.source || 'Document'} (Score: ${(doc.score * 100).toFixed(0)}%)
                    </div>
                `).join('')}
            </div>
        `;

        // Insert after detail
        if (this.dom.detail) {
            this.dom.detail.after(ragDiv);
        }
    }

    showConsensus(payload) {
        if (!payload) return;

        const method = payload.method || 'unknown';
        const message = method === 'meta_agent'
            ? 'Consensus: Meta-agent synthesized best output'
            : `Consensus: ${method} reconciliation applied`;

        this.updateDetail(message);
    }

    setFinalStatus() {
        this.container.querySelector('.status-dot').style.animation = 'none';
        this.container.querySelector('.status-dot').style.background = 'var(--success-color)';
        this.updateDetail('Reasoning complete. Best path selected.');
    }
}
