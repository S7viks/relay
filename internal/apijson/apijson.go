// Package apijson provides consistent JSON request/response helpers for HTTP APIs.
package apijson

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const defaultMaxBodyBytes = 1 << 20 // 1 MiB

// ErrorPayload is the standard error shape for JSON APIs.
type ErrorPayload struct {
	Error   string `json:"error"`
	Success bool   `json:"success"`
	Code    string `json:"code,omitempty"`
}

// WriteError writes a JSON error body and sets Content-Type.
func WriteError(w http.ResponseWriter, status int, message string, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(ErrorPayload{Error: message, Success: false, Code: code})
}

// DecodeJSON reads r.Body with MaxBytesReader and decodes into v. On failure writes JSON error and returns false.
func DecodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, v interface{}) bool {
	if maxBytes <= 0 {
		maxBytes = defaultMaxBodyBytes
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	defer r.Body.Close()
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(v); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			WriteError(w, http.StatusRequestEntityTooLarge, "Request body too large", "body_too_large")
			return false
		}
		if errors.Is(err, io.EOF) {
			WriteError(w, http.StatusBadRequest, "Request body is required", "empty_body")
			return false
		}
		WriteError(w, http.StatusBadRequest, "Invalid JSON: "+err.Error(), "invalid_json")
		return false
	}
	return true
}
