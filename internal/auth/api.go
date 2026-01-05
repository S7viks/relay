package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"gaiol/internal/database"
)

// AuthAPI handles Supabase Auth API integration
type AuthAPI struct {
	SupabaseURL string
	APIKey      string
	HTTPClient  *http.Client
}

// NewAuthAPI creates a new AuthAPI instance
func NewAuthAPI(db *database.Client) *AuthAPI {
	return &AuthAPI{
		SupabaseURL: db.URL,
		APIKey:      db.APIKey,
		HTTPClient:  &http.Client{},
	}
}

// SignUpRequest represents a user signup request
type SignUpRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Data     map[string]interface{} `json:"data,omitempty"` // User metadata
}

// SignUpResponse represents the response from signup
type SignUpResponse struct {
	User        *UserInfo `json:"user"`
	Session     *Session  `json:"session,omitempty"`
	AccessToken string    `json:"access_token,omitempty"`
	RefreshToken string   `json:"refresh_token,omitempty"`
}

// UserInfo represents Supabase user information
type UserInfo struct {
	ID           string                 `json:"id"`
	Email        string                 `json:"email"`
	UserMetadata map[string]interface{} `json:"user_metadata"`
	AppMetadata  map[string]interface{} `json:"app_metadata"`
	CreatedAt    string                 `json:"created_at"`
}

// Session represents an authentication session
type Session struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	TokenType    string `json:"token_type"`
	User         *UserInfo `json:"user"`
}

// SignInRequest represents a user signin request
type SignInRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// SignInResponse represents the response from signin
type SignInResponse struct {
	Session     *Session  `json:"session"`
	User        *UserInfo `json:"user"`
	AccessToken string    `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
}

// SignUp creates a new user account
func (a *AuthAPI) SignUp(ctx context.Context, req SignUpRequest) (*SignUpResponse, error) {
	url := fmt.Sprintf("%s/auth/v1/signup", a.SupabaseURL)
	
	payload := map[string]interface{}{
		"email":    req.Email,
		"password": req.Password,
	}
	if req.Data != nil {
		payload["data"] = req.Data
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("apikey", a.APIKey)
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	resp, err := a.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		var errorResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
			Msg     string `json:"msg"`
		}
		json.Unmarshal(respBody, &errorResp)
		errorMsg := errorResp.Message
		if errorMsg == "" {
			errorMsg = errorResp.Error
		}
		if errorMsg == "" {
			errorMsg = errorResp.Msg
		}
		if errorMsg == "" {
			errorMsg = string(respBody)
		}
		return nil, fmt.Errorf("signup failed: %s", errorMsg)
	}

	var result struct {
		User    *UserInfo `json:"user"`
		Session *Session  `json:"session"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	response := &SignUpResponse{
		User:    result.User,
		Session: result.Session,
	}
	if result.Session != nil {
		response.AccessToken = result.Session.AccessToken
		response.RefreshToken = result.Session.RefreshToken
	}

	return response, nil
}

// SignIn authenticates a user and returns a session
func (a *AuthAPI) SignIn(ctx context.Context, req SignInRequest) (*SignInResponse, error) {
	url := fmt.Sprintf("%s/auth/v1/token?grant_type=password", a.SupabaseURL)
	
	payload := map[string]string{
		"email":    req.Email,
		"password": req.Password,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("apikey", a.APIKey)
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	resp, err := a.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errorResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
			Msg     string `json:"msg"`
		}
		json.Unmarshal(respBody, &errorResp)
		errorMsg := errorResp.Message
		if errorMsg == "" {
			errorMsg = errorResp.Error
		}
		if errorMsg == "" {
			errorMsg = errorResp.Msg
		}
		if errorMsg == "" {
			errorMsg = string(respBody)
		}
		return nil, fmt.Errorf("signin failed: %s", errorMsg)
	}

	var result struct {
		AccessToken  string    `json:"access_token"`
		RefreshToken string    `json:"refresh_token"`
		ExpiresIn    int       `json:"expires_in"`
		TokenType    string    `json:"token_type"`
		User         *UserInfo `json:"user"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &SignInResponse{
		Session: &Session{
			AccessToken:  result.AccessToken,
			RefreshToken: result.RefreshToken,
			ExpiresIn:    result.ExpiresIn,
			TokenType:    result.TokenType,
			User:         result.User,
		},
		User:         result.User,
		AccessToken:  result.AccessToken,
		RefreshToken: result.RefreshToken,
	}, nil
}

// RefreshToken refreshes an access token using a refresh token
func (a *AuthAPI) RefreshToken(ctx context.Context, refreshToken string) (*Session, error) {
	url := fmt.Sprintf("%s/auth/v1/token?grant_type=refresh_token", a.SupabaseURL)
	
	payload := map[string]string{
		"refresh_token": refreshToken,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("apikey", a.APIKey)
	httpReq.Header.Set("Authorization", "Bearer "+a.APIKey)

	resp, err := a.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errorResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		json.Unmarshal(respBody, &errorResp)
		return nil, fmt.Errorf("token refresh failed: %s", errorResp.Message)
	}

	var result Session
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetUser retrieves user information from a token
func (a *AuthAPI) GetUser(ctx context.Context, accessToken string) (*UserInfo, error) {
	url := fmt.Sprintf("%s/auth/v1/user", a.SupabaseURL)

	httpReq, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("apikey", a.APIKey)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := a.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var errorResp struct {
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		json.Unmarshal(respBody, &errorResp)
		return nil, fmt.Errorf("get user failed: %s", errorResp.Message)
	}

	var user UserInfo
	if err := json.Unmarshal(respBody, &user); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &user, nil
}

// SignOut signs out a user (invalidates the session)
func (a *AuthAPI) SignOut(ctx context.Context, accessToken string) error {
	url := fmt.Sprintf("%s/auth/v1/logout", a.SupabaseURL)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("apikey", a.APIKey)
	httpReq.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := a.HTTPClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("signout failed: %s", string(respBody))
	}

	return nil
}
