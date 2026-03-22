package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Client calls the Node orchestrator HTTP API using contract v1 only.
type Client struct {
	BaseURL string
	HTTP    *http.Client
}

// NewClient trims trailing slashes from baseURL (e.g. http://127.0.0.1:8787).
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		HTTP:    http.DefaultClient,
	}
}

// Orchestrate POSTs /v1/orchestrate with a v1 envelope and returns a validated v1 response.
func (c *Client) Orchestrate(ctx context.Context, req *OrchestrateRequestV1) (*OrchestrateResponseV1, error) {
	if err := ValidateOrchestrateRequestV1(req); err != nil {
		return nil, err
	}
	if c.BaseURL == "" {
		return nil, fmt.Errorf("orchestratorcontract: BaseURL is empty")
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	url := c.BaseURL + "/v1/orchestrate"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	hc := c.HTTP
	if hc == nil {
		hc = http.DefaultClient
	}
	resp, err := hc.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("orchestratorcontract: %s returned %d: %s", url, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var out OrchestrateResponseV1
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("orchestratorcontract: decode response: %w", err)
	}
	if err := ValidateOrchestrateResponseV1(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

// GetTraceBundle GETs /v1/traces/:traceId from the TS orchestrator (debug / replay bundle).
func (c *Client) GetTraceBundle(ctx context.Context, traceID string) ([]byte, int, error) {
	if c.BaseURL == "" {
		return nil, 0, fmt.Errorf("orchestratorcontract: BaseURL is empty")
	}
	traceID = strings.TrimSpace(traceID)
	if traceID == "" || strings.ContainsAny(traceID, "/?#") {
		return nil, 0, fmt.Errorf("orchestratorcontract: invalid trace id")
	}
	url := c.BaseURL + "/v1/traces/" + traceID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, err
	}
	hc := c.HTTP
	if hc == nil {
		hc = http.DefaultClient
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}
