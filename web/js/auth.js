// Authentication Module
// Handles user authentication, login, logout, and profile management

let currentUser = null;
let authCheckInterval = null;
let isLoadingProfile = false; // Prevent concurrent profile loads

/**
 * Initialize authentication on page load
 */
async function initAuth() {
    // Check if user is already authenticated
    if (isAuthenticated()) {
        try {
            await loadUserProfile();
            updateAuthUI();
            // Update top bar profile after profile is loaded
            if (typeof updateTopBarProfile === 'function') {
                updateTopBarProfile();
            }
        } catch (error) {
            console.warn('Failed to load user profile:', error);
            // Only clear tokens if it's a definitive auth error (not network error)
            const errorMsg = error.message || '';
            if (errorMsg.includes('Authentication required') ||
                errorMsg.includes('Invalid') ||
                errorMsg.includes('expired') ||
                errorMsg.includes('401')) {
                clearTokens();
            }
            // Always update UI regardless of error
            updateAuthUI();
            // Update top bar profile even on error
            if (typeof updateTopBarProfile === 'function') {
                updateTopBarProfile();
            }
        }
    } else {
        updateAuthUI();
        // Update top bar profile for non-authenticated state
        if (typeof updateTopBarProfile === 'function') {
            updateTopBarProfile();
        }
    }

    // Set up periodic session check
    if (authCheckInterval) {
        clearInterval(authCheckInterval);
    }
    authCheckInterval = setInterval(async () => {
        if (isAuthenticated()) {
            try {
                await refreshAccessToken();
            } catch (error) {
                console.warn('Token refresh failed:', error);
                // Only sign out if refresh token is definitively invalid
                // Don't sign out on network errors or temporary issues
                const errorMsg = error.message || '';
                if (errorMsg.includes('Invalid') ||
                    errorMsg.includes('expired') ||
                    errorMsg.includes('refresh token') ||
                    (errorMsg.includes('Authentication') && !errorMsg.includes('network'))) {
                    // Only clear tokens, don't force logout - let user continue working
                    clearTokens();
                    updateAuthUI();
                }
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
}

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginBtnSpinner = document.getElementById('loginBtnSpinner');
    const errorDiv = document.getElementById('loginError');

    // Show loading state
    loginBtn.disabled = true;
    loginBtnText.style.display = 'none';
    loginBtnSpinner.style.display = 'inline-block';
    errorDiv.style.display = 'none';

    try {
        const result = await signIn(email, password);
        currentUser = result.user;
        window.currentUser = currentUser; // Expose globally

        // Update UI
        updateAuthUI();
        showToast('success', 'Signed in successfully', `Welcome back, ${result.user?.email || 'User'}!`);

        // Redirect to chat page
        switchPage('chat');
    } catch (error) {
        errorDiv.textContent = error.message || 'Sign in failed. Please check your credentials.';
        errorDiv.style.display = 'block';
        showToast('error', 'Sign in failed', error.message);
    } finally {
        loginBtn.disabled = false;
        loginBtnText.style.display = 'inline';
        loginBtnSpinner.style.display = 'none';
    }
}

/**
 * Handle signup form submission
 */
async function handleSignup(event) {
    event.preventDefault();

    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const signupBtn = document.getElementById('signupBtn');
    const signupBtnText = document.getElementById('signupBtnText');
    const signupBtnSpinner = document.getElementById('signupBtnSpinner');
    const errorDiv = document.getElementById('signupError');

    // Validate passwords match
    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }

    // Validate password length
    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.style.display = 'block';
        return;
    }

    // Show loading state
    signupBtn.disabled = true;
    signupBtnText.style.display = 'none';
    signupBtnSpinner.style.display = 'inline-block';
    errorDiv.style.display = 'none';

    try {
        const result = await signUp(email, password);
        currentUser = result.user;
        window.currentUser = currentUser; // Expose globally

        // Update UI
        updateAuthUI();
        showToast('success', 'Account created', 'Welcome to GAIOL!');

        // Redirect to chat page
        window.location.href = '/index.html';
    } catch (error) {
        const errorMessage = error.message || 'Sign up failed. Please try again.';
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
        showToast('error', 'Sign up failed', errorMessage);
        console.error('Signup error:', error);
    } finally {
        signupBtn.disabled = false;
        signupBtnText.style.display = 'inline';
        signupBtnSpinner.style.display = 'none';
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await signOut();
        currentUser = null;
        window.currentUser = null; // Clear global reference
        updateAuthUI();
        showToast('success', 'Signed out', 'You have been signed out successfully');
        switchPage('login');
    } catch (error) {
        console.error('Logout error:', error);
        // Clear tokens even if request fails
        clearTokens();
        currentUser = null;
        window.currentUser = null; // Clear global reference
        updateAuthUI();
        switchPage('login');
    }
}

/**
 * Load user profile information
 */
async function loadUserProfile() {
    // Don't make API calls if user is not authenticated
    if (!isAuthenticated()) {
        currentUser = null;
        window.currentUser = null;
        return null;
    }

    // Prevent concurrent profile loads
    if (isLoadingProfile) {
        return currentUser;
    }

    isLoadingProfile = true;

    try {
        const session = await getSession();
        if (session && session.user) {
            currentUser = session.user;
            window.currentUser = currentUser; // Expose globally
            return currentUser;
        }

        // Fallback: try to get user directly
        const user = await getCurrentUser();
        currentUser = user;
        window.currentUser = currentUser; // Expose globally
        return currentUser;
    } catch (error) {
        // Silently handle auth errors (not logged in) - this is expected
        const errorMsg = (error.message || '').toLowerCase();
        if (errorMsg.includes('401') ||
            errorMsg.includes('unauthorized') ||
            errorMsg.includes('authentication required')) {
            // Don't clear tokens here - let initAuth handle that decision
            // This allows the user to still interact with the app even if profile load fails
            currentUser = null;
            window.currentUser = null;
            return null; // User is not logged in, which is fine
        }
        // Only log unexpected errors (network issues, 500, etc.)
        console.error('Failed to load user profile:', error);
        currentUser = null;
        window.currentUser = null;
        return null; // Return null instead of throwing
    } finally {
        isLoadingProfile = false;
    }
}

/**
 * Update authentication UI based on current state
 */
function updateAuthUI() {
    const isAuth = isAuthenticated();
    const loginNavItem = document.getElementById('loginNavItem');
    const profileNavItem = document.getElementById('profileNavItem');

    if (loginNavItem) {
        if (isAuth) {
            loginNavItem.style.display = 'none';
            loginNavItem.textContent = 'Sign In';
        } else {
            loginNavItem.style.display = 'block';
            loginNavItem.textContent = 'Sign In';
        }
    }

    if (profileNavItem) {
        profileNavItem.style.display = isAuth ? 'block' : 'none';
    }

    // Update top bar profile button
    if (typeof updateTopBarProfile === 'function') {
        updateTopBarProfile();
    }

    // Update profile page if it's active
    if (isAuth && currentUser) {
        updateProfilePage();
    }
}

/**
 * Update profile page with user information
 */
function updateProfilePage() {
    if (!currentUser) return;

    // Update profile header
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const profileId = document.getElementById('profileId');
    const profileAvatarText = document.getElementById('profileAvatarText');

    if (profileName) {
        profileName.textContent = currentUser.email?.split('@')[0] || 'User';
    }
    if (profileEmail) {
        profileEmail.textContent = currentUser.email || '-';
    }
    if (profileId) {
        profileId.textContent = currentUser.id || '-';
    }
    if (profileAvatarText) {
        const initial = (currentUser.email?.[0] || 'U').toUpperCase();
        profileAvatarText.textContent = initial;
    }

    // Update account information
    const profileUserId = document.getElementById('profileUserId');
    const profileUserEmail = document.getElementById('profileUserEmail');
    const profileCreatedAt = document.getElementById('profileCreatedAt');
    const profileTenantId = document.getElementById('profileTenantId');

    if (profileUserId) {
        profileUserId.textContent = currentUser.id || '-';
    }
    if (profileUserEmail) {
        profileUserEmail.textContent = currentUser.email || '-';
    }
    if (profileCreatedAt) {
        if (currentUser.created_at) {
            const date = new Date(currentUser.created_at);
            profileCreatedAt.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } else {
            profileCreatedAt.textContent = '-';
        }
    }
    if (profileTenantId) {
        const tenantId = currentUser.user_metadata?.tenant_id || currentUser.id || '-';
        profileTenantId.textContent = tenantId;
    }

    // Update session status
    const sessionStatusBadge = document.getElementById('sessionStatusBadge');
    const tokenExpires = document.getElementById('tokenExpires');

    if (sessionStatusBadge) {
        sessionStatusBadge.textContent = 'Active';
        sessionStatusBadge.className = 'status-badge status-active';
    }
    if (tokenExpires) {
        // Tokens typically expire in 1 hour
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        tokenExpires.textContent = expiresAt.toLocaleTimeString();
    }
}

/**
 * Refresh session and update profile
 */
async function refreshSession() {
    showLoading('Refreshing session...');
    try {
        await refreshAccessToken();
        await loadUserProfile();
        updateProfilePage();
        hideLoading();
        showToast('success', 'Session refreshed', 'Your session has been refreshed');
    } catch (error) {
        hideLoading();
        showToast('error', 'Session refresh failed', error.message);
        // If refresh fails, sign out
        handleLogout();
    }
}

/**
 * Show forgot password (placeholder)
 */
function showForgotPassword() {
    showToast('info', 'Password Reset', 'Password reset functionality coming soon');
}

/**
 * Handle delete account (placeholder)
 */
function handleDeleteAccount() {
    showToast('info', 'Account Deletion', 'Account deletion is not yet implemented');
}

/**
 * Check if user needs to be authenticated for current page
 */
function requireAuth() {
    if (!isAuthenticated()) {
        showToast('warning', 'Authentication Required', 'Please sign in to access this page');
        switchPage('login');
        return false;
    }
    return true;
}

/**
 * Update navigation to show current page names
 */
function updateNavigationPageNames() {
    const pageNames = {
        'chat': 'Chat',
        'models': 'Models',
        'compare': 'Compare',
        'history': 'History',
        'settings': 'Settings',
        'profile': 'Profile',
        'login': 'Sign In',
        'signup': 'Sign Up'
    };

    // Update navigation.js switchPage function if needed
    if (typeof switchPage === 'function') {
        const originalSwitchPage = window.switchPage;
        window.switchPage = function (pageId) {
            originalSwitchPage(pageId);
            const currentPageEl = document.getElementById('currentPage');
            if (currentPageEl) {
                currentPageEl.textContent = pageNames[pageId] || pageId;
            }
        };
    }
}

// Initialize auth when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    initAuth();
    updateNavigationPageNames();

    // Update auth UI when page changes
    if (typeof switchPage === 'function') {
        const originalSwitchPage = window.switchPage;
        window.switchPage = function (pageId) {
            originalSwitchPage(pageId);

            // Check if page requires auth
            const protectedPages = ['profile'];
            if (protectedPages.includes(pageId) && !requireAuth()) {
                return;
            }

            // Load profile if on profile page
            if (pageId === 'profile' && isAuthenticated()) {
                loadUserProfile().then(() => {
                    updateProfilePage();
                }).catch(error => {
                    console.error('Failed to load profile:', error);
                });
            }
        };
    }
});

/**
 * Switch to signup page
 */
function switchToSignup() {
    if (typeof switchPage === 'function') {
        switchPage('signup');
    }
}

/**
 * Switch to login page
 */
function switchToLogin() {
    if (typeof switchPage === 'function') {
        switchPage('login');
    }
}

/**
 * Update auth navigation items (wrapper for updateAuthUI)
 */
function updateAuthNavItems() {
    updateAuthUI();
}

// Make functions globally available
window.initAuth = initAuth;
window.handleLogin = handleLogin;
window.handleSignup = handleSignup;
window.handleLogout = handleLogout;
window.refreshSession = refreshSession;
window.showForgotPassword = showForgotPassword;
window.handleDeleteAccount = handleDeleteAccount;
window.loadUserProfile = loadUserProfile;
window.updateAuthUI = updateAuthUI;
window.updateAuthNavItems = updateAuthNavItems;
window.switchToSignup = switchToSignup;
window.switchToLogin = switchToLogin;
