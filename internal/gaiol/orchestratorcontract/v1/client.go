package v1

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
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

// GetTrustJSON GETs /v1/trust from the TS orchestrator (optional domain query).
func (c *Client) GetTrustJSON(ctx context.Context, domain string) ([]byte, int, error) {
	if c.BaseURL == "" {
		return nil, 0, fmt.Errorf("orchestratorcontract: BaseURL is empty")
	}
	u, err := url.Parse(c.BaseURL + "/v1/trust")
	if err != nil {
		return nil, 0, err
	}
	domain = strings.TrimSpace(domain)
	if domain != "" {
		q := u.Query()
		q.Set("domain", domain)
		u.RawQuery = q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
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

// GetTraceIndexJSON GETs /v1/traces?limit= from the TS orchestrator.
func (c *Client) GetTraceIndexJSON(ctx context.Context, limit int) ([]byte, int, error) {
	if c.BaseURL == "" {
		return nil, 0, fmt.Errorf("orchestratorcontract: BaseURL is empty")
	}
	if limit < 1 {
		limit = 50
	}
	if limit > 500 {
		limit = 500
	}
	u := c.BaseURL + "/v1/traces?limit=" + strconv.Itoa(limit)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
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

// PostEvalContainsJSON POSTs /v1/eval/contains with a JSON body (pass-through).
func (c *Client) PostEvalContainsJSON(ctx context.Context, bodyJSON []byte) ([]byte, int, error) {
	if c.BaseURL == "" {
		return nil, 0, fmt.Errorf("orchestratorcontract: BaseURL is empty")
	}
	urlStr := c.BaseURL + "/v1/eval/contains"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlStr, bytes.NewReader(bodyJSON))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
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
