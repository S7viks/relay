/**
 * GAIOL Reasoning Engine Client
 * Handles API calls and WebSocket streaming for reasoning sessions
 */

const ReasoningEngine = {
    sessionID: null,
    socket: null,
    onEventCallback: null,

    /**
     * Start a new reasoning session
     * @param {string} prompt - The user's input prompt
     * @param {string[]} models - Array of model IDs to use (empty array = auto-select)
     * @param {object} config - Optional configuration (beam search settings)
     */
    async start(prompt, models, config = {}) {
        try {
            // Get auth token if available
            const token = localStorage.getItem('gaiol_access_token');
            const headers = { 'Content-Type': 'application/json' };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch((typeof apiUrl === 'function' ? apiUrl : function (p) { return p; })('/api/reasoning/start'), {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    prompt,
                    models,
                    ...config  // Include beam search and other configs
                })
            });

            if (!response.ok) {
                // Handle authentication errors
                if (response.status === 401) {
                    const error = new Error('Authentication required. Please sign in to use the reasoning engine.');
                    if (this.onEventCallback) {
                        this.onEventCallback({ type: 'error', payload: error.message });
                    }
                    throw error;
                }
                // Handle other errors
                const errorText = await response.text();
                let errorMessage = 'Failed to start reasoning session';
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error || errorData.message || errorMessage;
                } catch (e) {
                    errorMessage = errorText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            this.sessionID = data.session_id;

            // Connect to WebSocket after starting
            this.connect(this.sessionID);
            return data;
        } catch (error) {
            console.error('Reasoning Error:', error);
            if (this.onEventCallback) {
                this.onEventCallback({ type: 'error', payload: error.message });
            }
            throw error; // Re-throw so caller can handle it
        }
    },

    /**
     * Connect to reasoning WebSocket
     * @param {string} sessionID 
     */
    connect(sessionID) {
        const wsUrl = (typeof apiWebSocketUrl === 'function' ? apiWebSocketUrl : function (p) {
            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            return proto + '//' + window.location.host + p;
        })('/api/reasoning/ws?session_id=' + encodeURIComponent(sessionID));

        // Close existing connection if any
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.close();
        }

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('Reasoning WebSocket Connected');
            if (this.onEventCallback) {
                this.onEventCallback({ type: 'ws_connected', payload: 'WebSocket connected' });
            }
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onEventCallback) {
                    this.onEventCallback(data);
                }
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
                if (this.onEventCallback) {
                    this.onEventCallback({ type: 'error', payload: 'Invalid message from server' });
                }
            }
        };

        this.socket.onclose = (event) => {
            console.log('Reasoning WebSocket Disconnected', event.code, event.reason);
            // Only emit error if it wasn't a normal closure
            if (event.code !== 1000 && this.onEventCallback) {
                this.onEventCallback({ 
                    type: 'ws_disconnected', 
                    payload: `WebSocket closed: ${event.reason || 'Connection lost'}` 
                });
            }
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
            if (this.onEventCallback) {
                this.onEventCallback({ type: 'error', payload: 'WebSocket connection error' });
            }
        };
    },

    /**
     * Set the final result (since it might come from the POST response or a separate event)
     */
    setFinalResult(output) {
        if (this.onEventCallback) {
            this.onEventCallback({ type: 'reasoning_end', payload: { final_output: output } });
        }
    },

    /**
     * Register a callback for reasoning events
     */
    onEvent(callback) {
        this.onEventCallback = callback;
    }
};

// Global instance
window.ReasoningEngine = ReasoningEngine;


// ----- reasoning-component -----

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
                        <span class="toggle-icon">â–²</span>
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
            this.dom.toggleIcon.textContent = this.isCollapsed ? 'â–¼' : 'â–²';
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
        const usageInfo = [tokenStr, costStr].filter(x => x).join(' â€¢ ');

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
                <span class="rag-icon">ðŸ“š</span>
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


// ----- reasoning-viz -----

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

                // No model selection - backend will auto-select best models
                this.startReasoning(prompt, []);
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
            case 'beam_update':
                this.dom.statusText.innerText = `Beam Search: ${event.payload.active_paths} paths, Best: ${(event.payload.best_score * 100).toFixed(0)}%`;
                break;
            case 'consensus':
                this.dom.statusText.innerText = `Consensus: ${event.payload.method || 'reconciling'}...`;
                break;
            case 'reasoning_end':
                this.renderFinalResult(event.payload.final_output);
                break;
            case 'error':
                this.dom.statusText.innerText = 'Error: ' + event.payload;
                alert('Error: ' + event.payload);
                break;
            case 'ws_connected':
                console.log('WebSocket connected');
                break;
            case 'ws_disconnected':
                console.log('WebSocket disconnected:', event.payload);
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

// Initialize only on the standalone reasoning page (avoids errors when bundled with chat)
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('reasoning-dashboard')) {
        ReasoningViz.init();
    }
});

