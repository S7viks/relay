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

            const response = await fetch('/api/reasoning/start', {
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
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/reasoning/ws?session_id=${sessionID}`;

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
