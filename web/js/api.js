// API Client Module
// Handles all API communication with the backend

const API_BASE = '';

// Token storage keys
const ACCESS_TOKEN_KEY = 'gaiol_access_token';
const REFRESH_TOKEN_KEY = 'gaiol_refresh_token';

/**
 * Get stored access token
 */
function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * Store access token
 */
function setAccessToken(token) {
    if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
}

/**
 * Get stored refresh token
 */
function getRefreshToken() {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * Store refresh token
 */
function setRefreshToken(token) {
    if (token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
}

/**
 * Clear all stored tokens
 */
function clearTokens() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * Centralized API request wrapper with error handling and retry logic
 */
async function apiRequest(endpoint, method = 'GET', body = null, retries = 3, requireAuth = false) {
    const url = `${API_BASE}${endpoint}`;
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies
    };

    // Add authentication token if available
    const token = getAccessToken();
    if (token || requireAuth) {
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        } else if (requireAuth) {
            throw new Error('Authentication required. Please sign in.');
        }
    }

    if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
    }

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                let errorData = {};
                try {
                    errorData = await response.json();
                } catch (e) {
                    // If response is not JSON, use status text
                    errorData = { error: response.statusText || `HTTP ${response.status}`, message: response.statusText || `HTTP ${response.status}` };
                }
                const errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
                throw new Error(errorMessage);
            }

            return {
                success: true,
                data: await response.json(),
                error: null
            };
        } catch (error) {
            if (i === retries - 1) {
                return {
                    success: false,
                    data: null,
                    error: error.message || 'Network error'
                };
            }
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

/**
 * Fetch all available models
 */
async function fetchAllModels() {
    const result = await apiRequest('/api/models');
    if (result.success && result.data.models) {
        return result.data.models;
    }
    throw new Error(result.error || 'Failed to fetch models');
}

/**
 * Fetch only free models
 */
async function fetchFreeModels() {
    const result = await apiRequest('/api/models/free');
    if (result.success && result.data.models) {
        return result.data.models;
    }
    throw new Error(result.error || 'Failed to fetch free models');
}

/**
 * Fetch models by provider
 */
async function fetchModelsByProvider(provider) {
    const result = await apiRequest(`/api/models/${provider}`);
    if (result.success && result.data.models) {
        return result.data.models;
    }
    throw new Error(result.error || `Failed to fetch models for provider: ${provider}`);
}

/**
 * Query multiple models (legacy endpoint)
 */
async function queryMultipleModels(prompt, modelIds, options = {}) {
    // Check authentication
    if (!isAuthenticated()) {
        throw new Error('Authentication required. Please sign in to use AI models.');
    }
    
    // Ensure valid token before making authenticated request
    await ensureValidToken();
    
    const body = {
        prompt,
        models: modelIds,
        max_tokens: options.max_tokens || 300,
        temperature: options.temperature || 0.7
    };

    const result = await apiRequest('/api/query', 'POST', body, 3, true);
    if (result.success) {
        return result.data;
    }
    throw new Error(result.error || 'Failed to query models');
}

/**
 * Query with smart routing
 */
async function queryWithSmartRouting(prompt, config = {}) {
    // Check authentication
    if (!isAuthenticated()) {
        throw new Error('Authentication required. Please sign in to use AI models.');
    }
    
    // Ensure valid token before making authenticated request
    await ensureValidToken();
    
    const body = {
        prompt,
        strategy: config.strategy || 'free_only',
        task: config.task || 'generate',
        max_tokens: config.max_tokens || 200,
        temperature: config.temperature || 0.7
    };

    const result = await apiRequest('/api/query/smart', 'POST', body, 3, true);
    if (result.success) {
        return result.data;
    }
    throw new Error(result.error || 'Failed to execute smart query');
}

/**
 * Query a specific model by ID
 */
async function querySpecificModel(prompt, modelId, options = {}) {
    // Check authentication
    if (!isAuthenticated()) {
        throw new Error('Authentication required. Please sign in to use AI models.');
    }
    
    // Ensure valid token before making authenticated request
    await ensureValidToken();
    
    const body = {
        prompt,
        model_id: modelId,
        max_tokens: options.max_tokens || 200,
        temperature: options.temperature || 0.7
    };

    const result = await apiRequest('/api/query/model', 'POST', body, 3, true);
    if (result.success) {
        return result.data;
    }
    throw new Error(result.error || 'Failed to query model');
}

/**
 * Check server health
 */
async function checkHealth() {
    const result = await apiRequest('/health');
    if (result.success) {
        return result.data;
    }
    throw new Error(result.error || 'Health check failed');
}

// === AUTHENTICATION FUNCTIONS ===

/**
 * Sign up a new user
 */
async function signUp(email, password, metadata = {}) {
    const body = {
        email,
        password,
        data: metadata
    };

    const result = await apiRequest('/api/auth/signup', 'POST', body);
    if (result.success) {
        // Store tokens if provided
        if (result.data.access_token) {
            setAccessToken(result.data.access_token);
        }
        if (result.data.refresh_token) {
            setRefreshToken(result.data.refresh_token);
        }
        return result.data;
    }
    throw new Error(result.error || 'Signup failed');
}

/**
 * Sign in a user
 */
async function signIn(email, password) {
    const body = {
        email,
        password
    };

    const result = await apiRequest('/api/auth/signin', 'POST', body);
    if (result.success) {
        // Store tokens
        if (result.data.access_token) {
            setAccessToken(result.data.access_token);
        }
        if (result.data.refresh_token) {
            setRefreshToken(result.data.refresh_token);
        }
        return result.data;
    }
    throw new Error(result.error || 'Sign in failed');
}

/**
 * Sign out the current user
 */
async function signOut() {
    try {
        await apiRequest('/api/auth/signout', 'POST', null, 1, true);
    } catch (error) {
        // Continue with clearing tokens even if request fails
        console.warn('Signout request failed:', error);
    } finally {
        clearTokens();
    }
}

/**
 * Get current session/user information
 */
async function getSession() {
    const result = await apiRequest('/api/auth/session', 'GET', null, 1, true);
    if (result.success) {
        return result.data;
    }
    throw new Error(result.error || 'Failed to get session');
}

/**
 * Get current user information
 */
async function getCurrentUser() {
    const result = await apiRequest('/api/auth/user', 'GET', null, 1, true);
    if (result.success) {
        return result.data.user;
    }
    throw new Error(result.error || 'Failed to get user');
}

/**
 * Refresh access token
 */
async function refreshAccessToken() {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    const body = {
        refresh_token: refreshToken
    };

    const result = await apiRequest('/api/auth/refresh', 'POST', body);
    if (result.success) {
        // Update stored tokens
        if (result.data.access_token) {
            setAccessToken(result.data.access_token);
        }
        if (result.data.refresh_token) {
            setRefreshToken(result.data.refresh_token);
        }
        return result.data;
    }
    
    // If refresh fails, clear tokens
    clearTokens();
    throw new Error(result.error || 'Token refresh failed');
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
    return !!getAccessToken();
}

/**
 * Auto-refresh token if expired (helper for apiRequest)
 */
async function ensureValidToken() {
    const token = getAccessToken();
    if (!token) {
        return false;
    }

    // Try to use current token, refresh if needed
    try {
        await getSession();
        return true;
    } catch (error) {
        // Token might be expired, try to refresh
        try {
            await refreshAccessToken();
            return true;
        } catch (refreshError) {
            clearTokens();
            return false;
        }
    }
}
