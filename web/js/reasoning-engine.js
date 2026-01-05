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
     * @param {string[]} models - Array of model IDs to use
     */
    async start(prompt, models) {
        try {
            const response = await fetch('/api/reasoning/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, models })
            });

            if (!response.ok) throw new Error('Failed to start reasoning session');

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
        }
    },

    /**
     * Connect to reasoning WebSocket
     * @param {string} sessionID 
     */
    connect(sessionID) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/reasoning?session_id=${sessionID}`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('Reasoning WebSocket Connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (this.onEventCallback) {
                this.onEventCallback(data);
            }
        };

        this.socket.onclose = () => {
            console.log('Reasoning WebSocket Disconnected');
        };

        this.socket.onerror = (error) => {
            console.error('WebSocket Error:', error);
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
