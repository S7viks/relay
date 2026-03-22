package apijson

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWriteError(t *testing.T) {
	rec := httptest.NewRecorder()
	WriteError(rec, http.StatusTeapot, "x", "c")
	if rec.Code != http.StatusTeapot {
		t.Fatalf("code %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `"error":"x"`) {
		t.Fatalf("body %q", rec.Body.String())
	}
}

func TestDecodeJSON_OK(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(`{"a":1}`))
	rec := httptest.NewRecorder()
	var v struct{ A int `json:"a"` }
	if !DecodeJSON(rec, req, 1024, &v) {
		t.Fatalf("expected ok, body=%s", rec.Body.String())
	}
	if v.A != 1 {
		t.Fatalf("a=%d", v.A)
	}
}

func TestDecodeJSON_TooLarge(t *testing.T) {
	large := `{"x":"` + strings.Repeat("a", 5000) + `"}`
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewBufferString(large))
	rec := httptest.NewRecorder()
	var v map[string]interface{}
	if DecodeJSON(rec, req, 200, &v) {
		t.Fatal("expected fail")
	}
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("code %d body %q", rec.Code, rec.Body.String())
	}
}
