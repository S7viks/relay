/**
 * ReasoningComponent
 * Handles rendering the 'Thought Process' inside chat bubbles
 */
class ReasoningComponent {
    constructor(containerId, sessionID) {
        this.container = document.getElementById(containerId);
        this.sessionID = sessionID;
        this.steps = [];
        this.activeStepIndex = 0;
        this.isCollapsed = false;

        this.render();
        this.setupListeners();
    }

    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="thought-process-container">
                <div class="thought-header">
                    <h4><span class="status-dot"></span> Thought Process</h4>
                    <span class="toggle-icon">▲</span>
                </div>
                <div class="thought-content">
                    <div class="steps-timeline-mini"></div>
                    <div class="model-grid-mini"></div>
                    <div class="step-detail-mini" style="margin-top: 10px; font-size: 11px; color: var(--text-tertiary); font-style: italic;">
                        Initializing reasoning engine...
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
            detail: this.container.querySelector('.step-detail-mini')
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
                this.activeStepIndex = payload.step_index;
                this.updateTimeline();
                this.updateDetail('Current Step: ' + payload.title);
                this.dom.modelGrid.innerHTML = ''; // Clear for new step
                break;
            case 'model_response':
                this.renderModelOutput(payload);
                break;
            case 'step_end':
                this.markStepCompleted(payload);
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
            pill.classList.toggle('active', i === this.activeStepIndex);
        });
    }

    renderModelOutput(payload) {
        const output = payload.output || payload;
        const card = document.createElement('div');
        card.className = 'model-card-mini';
        const modelName = output.model_id ? output.model_id.split('/').pop() : 'Model';
        card.innerHTML = `
            <span class="model-name">${modelName}</span>
            <div class="model-score">Thinking...</div>
        `;
        this.dom.modelGrid.appendChild(card);
    }

    markStepCompleted(payload) {
        const pills = this.dom.timeline.querySelectorAll('.step-pill');
        const activePill = pills[this.activeStepIndex];
        if (activePill) {
            activePill.classList.remove('active');
            activePill.classList.add('completed');
        }

        // Highlight winner in grid
        if (payload.selected_output) {
            const winnerModelId = payload.selected_output.model_id;
            const cards = this.dom.modelGrid.querySelectorAll('.model-card-mini');
            cards.forEach(card => {
                const name = card.querySelector('.model-name').textContent;
                if (winnerModelId.includes(name)) {
                    card.classList.add('winner');
                    const score = payload.selected_output.scores ? (payload.selected_output.scores.overall * 100).toFixed(0) + '%' : 'Selected';
                    card.querySelector('.model-score').textContent = score + ' Match';
                }
            });
        }
    }

    setFinalStatus() {
        this.container.querySelector('.status-dot').style.animation = 'none';
        this.container.querySelector('.status-dot').style.background = 'var(--success-color)';
        this.updateDetail('Reasoning complete. Best path selected.');
    }
}
