/**
 * GAIOL Reasoning Visualization
 * Handles DOM updates for the reasoning dashboard
 */

const ReasoningViz = {
    steps: [],
    currentStepIndex: -1,

    init() {
        this.cacheDOM();
        this.bindEvents();

        // Listen for engine events
        window.ReasoningEngine.onEvent((event) => this.handleEvent(event));
    },

    cacheDOM() {
        this.dom = {
            inputArea: document.getElementById('start-screen'),
            dashboard: document.getElementById('reasoning-dashboard'),
            timeline: document.getElementById('steps-timeline'),
            modelGrid: document.getElementById('model-grid'),
            stepTitle: document.getElementById('current-step-title'),
            stepObjective: document.getElementById('current-step-objective'),
            targetPrompt: document.getElementById('target-prompt'),
            promptInput: document.getElementById('reasoning-input'),
            startBtn: document.getElementById('start-reasoning-btn'),
            finalCard: document.getElementById('final-output-card'),
            finalText: document.getElementById('final-text'),
            statusText: document.getElementById('session-status'),
            sessionID: document.getElementById('session-id')
        };
    },

    bindEvents() {
        if (this.dom.startBtn) {
            this.dom.startBtn.onclick = () => {
                const prompt = this.dom.promptInput.value;
                if (!prompt) return;

                const models = Array.from(document.querySelectorAll('.checkbox-group input:checked'))
                    .map(i => i.value);

                this.startReasoning(prompt, models);
            };
        }
    },

    async startReasoning(prompt, models) {
        this.dom.inputArea.classList.add('hidden');
        this.dom.dashboard.classList.add('dashboard-visible');
        this.dom.targetPrompt.innerText = prompt;
        this.dom.statusText.innerText = "Initializing...";

        await window.ReasoningEngine.start(prompt, models);
    },

    handleEvent(event) {
        console.log('Viz Event:', event);

        switch (event.type) {
            case 'decompose_start':
                this.dom.statusText.innerText = "Decomposing Prompt...";
                break;
            case 'decompose_end':
                this.renderTimeline(event.payload.steps);
                break;
            case 'step_start':
                this.setCurrentStep(event.payload.step_index);
                break;
            case 'model_response':
                this.renderModelOutput(event.payload.output, false);
                break;
            case 'step_end':
                this.markStepCompleted(event.payload);
                break;
            case 'reasoning_end':
                this.renderFinalResult(event.payload.final_output);
                break;
            case 'error':
                alert('Error: ' + event.payload);
                break;
        }
    },

    renderTimeline(steps) {
        this.steps = steps;
        this.dom.timeline.innerHTML = '';
        steps.forEach((step, i) => {
            const stepEl = document.createElement('div');
            stepEl.className = 'timeline-step';
            stepEl.id = `timeline-step-${i}`;
            stepEl.innerHTML = `<strong>Step ${i + 1}: ${step.title}</strong><p>${step.objective}</p>`;
            this.dom.timeline.appendChild(stepEl);
        });
    },

    setCurrentStep(index) {
        this.currentStepIndex = index;
        const step = this.steps[index];

        // Update header
        this.dom.stepTitle.innerText = `Step ${index + 1}: ${step.title}`;
        this.dom.stepObjective.innerText = step.objective;
        this.dom.statusText.innerText = `Processing Step ${index + 1}...`;

        // Update timeline UI
        document.querySelectorAll('.timeline-step').forEach(el => el.classList.remove('active'));
        const stepEl = document.getElementById(`timeline-step-${index}`);
        if (stepEl) stepEl.classList.add('active');

        // Clear model grid for new step
        this.dom.modelGrid.innerHTML = '';
    },

    renderModelOutput(output, isWinner) {
        const card = document.createElement('div');
        card.className = `glass-card model-card ${isWinner ? 'winner' : ''}`;

        const score = output.scores ? (output.scores.overall * 100).toFixed(0) : '...';
        const breakdown = output.scores ? `
            <div class="score-breakdown">
                <span>Rel: ${(output.scores.relevance * 100).toFixed(0)}%</span>
                <span>Coh: ${(output.scores.coherence * 100).toFixed(0)}%</span>
                <span>Comp: ${(output.scores.completeness * 100).toFixed(0)}%</span>
            </div>
        ` : '';

        card.innerHTML = `
            <div class="model-card-header">
                <strong>${output.model_id.split('/').pop()}</strong>
                <span class="score-badge" title="Overall Score: ${score}%">${score}% Match</span>
            </div>
            ${breakdown}
            <div class="model-response-text">${output.response}</div>
        `;

        this.dom.modelGrid.appendChild(card);
    },

    markStepCompleted(step) {
        const stepEl = document.getElementById(`timeline-step-${step.index}`);
        if (stepEl) {
            stepEl.classList.remove('active');
            stepEl.classList.add('completed');
        }

        // Re-render model grid with the winner highlighted
        this.dom.modelGrid.innerHTML = '';
        step.model_outputs.forEach(output => {
            const isWinner = step.selected_output && output.model_id === step.selected_output.model_id;
            this.renderModelOutput(output, isWinner);
        });
    },

    renderFinalResult(text) {
        this.dom.statusText.innerText = "Completed";
        this.dom.finalCard.classList.remove('hidden');
        this.dom.finalText.innerHTML = text.replace(/\n/g, '<br>');
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => ReasoningViz.init());
