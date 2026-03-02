package uaip // Package for UAIP-specific types. Why: Separates protocol from models/orchestration.

import ( // Imports.
	"time" // For timestamps in headers/context.
)

// UAIPRequest represents a complete UAIP protocol request
type UAIPRequest struct { // Main request struct. Why: Bundles all UAIP sections for easy passing (e.g., to adapters).
	UAIP     UAIPHeader `json:"uaip"`     // Protocol header.
	Routing  Routing    `json:"routing"`  // Source/target.
	Task     Task       `json:"task"`     // What to do.
	Context  Context    `json:"context"`  // History/embeddings.
	Payload  Payload    `json:"payload"`  // Input/output specs.
	Security Security   `json:"security"` // Auth/privacy.
	Metadata Metadata   `json:"metadata"` // Extra info.
}

// UAIPResponse represents a complete UAIP protocol response
type UAIPResponse struct { // Main response struct. Why: Mirrors request for symmetry; adapters return this.
	UAIP     UAIPHeader       `json:"uaip"`            // Header.
	Status   ResponseStatus   `json:"status"`          // Success/fail.
	Result   Result           `json:"result"`          // Output data.
	Metadata ResponseMetadata `json:"metadata"`        // Perf/cost.
	Error    *ErrorInfo       `json:"error,omitempty"` // Optional error (omitempty omits if nil).
}

// UAIPHeader contains protocol-level information
type UAIPHeader struct { // Header for every message. Why: Versioning and tracking (e.g., correlate requests/responses).
	Version       string    `json:"version"`        // e.g., "2.0".
	MessageID     string    `json:"message_id"`     // Unique ID.
	CorrelationID string    `json:"correlation_id"` // Links req/res.
	Timestamp     time.Time `json:"timestamp"`      // When sent.
	TTL           int       `json:"ttl"`            // Expiry in seconds.
	Priority      int       `json:"priority"`       // 1-4 level.
}

// Routing contains information about source and target
type Routing struct { // Routing info. Why: Tells engine where to send (source) and what to match (target).
	Source SourceAgent        `json:"source"` // Sender details.
	Target TargetRequirements `json:"target"` // Needs (e.g., free model).
}

// SourceAgent identifies who is making the request
type SourceAgent struct { // Sender. Why: Logs/tracks originator (e.g., "orchestrator").
	AgentID      string   `json:"agent_id"`
	Type         string   `json:"type"`
	Version      string   `json:"version"`
	Capabilities []string `json:"capabilities"`
}

// TargetRequirements specifies what kind of AI model is needed
type TargetRequirements struct { // Model criteria. Why: Engine filters registry (e.g., free, low-cost).
	TaskTypes        []string `json:"task_types"`
	PreferFreeModels bool     `json:"prefer_free_models"`
	MaxCostPerReq    float64  `json:"max_cost_per_request"`
	MaxLatencyMs     int      `json:"max_latency_ms"`
	MinQualityScore  float64  `json:"min_quality_score"`
	FallbackStrategy string   `json:"fallback_strategy"`
}

// Task contains the specific work to be done
type Task struct { // Task details. Why: Defines action (e.g., generate) with policies.
	ID              string          `json:"id"`
	Type            string          `json:"type"`
	Priority        string          `json:"priority"`
	TimeoutMs       int             `json:"timeout_ms"`
	RetryPolicy     RetryPolicy     `json:"retry_policy"`     // Failure handling.
	CostConstraints CostConstraints `json:"cost_constraints"` // Budget limits.
}

// RetryPolicy defines how to handle failures
type RetryPolicy struct { // Retry config. Why: Handles API flakes (e.g., rate limits) without failing.
	MaxRetries      int      `json:"max_retries"`
	BackoffStrategy string   `json:"backoff_strategy"`
	RetryOn         []string `json:"retry_on"`
	FallbackToPaid  bool     `json:"fallback_to_paid"`
}

// CostConstraints limits spending
type CostConstraints struct { // Cost rules. Why: Enforces free-first (e.g., max $0.01/req).
	MaxTotalCost     float64 `json:"max_total_cost"`
	PreferFreeModels bool    `json:"prefer_free_models"`
	CostTrackingOn   bool    `json:"cost_tracking_enabled"`
}

// Context preserves conversation and session state
type Context struct { // State holder. Why: Maintains history for multi-turn chats.
	ConversationHistory []ConversationTurn `json:"conversation_history"`
	Embeddings          EmbeddingInfo      `json:"embeddings"` // Vector data.
	Session             SessionInfo        `json:"session"`
}

// ConversationTurn represents one exchange in a conversation
type ConversationTurn struct { // Chat message. Why: Builds history (e.g., user/assistant roles).
	Role      string                 `json:"role"`
	Content   string                 `json:"content"`
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata"` // Flexible extras.
}

// EmbeddingInfo contains vector embeddings for context
type EmbeddingInfo struct { // Embeddings. Why: For similarity search in context.
	Vector              []float64 `json:"vector"`
	Model               string    `json:"model"`
	Dimensions          int       `json:"dimensions"`
	SimilarityThreshold float64   `json:"similarity_threshold"`
}

// SessionInfo contains session-level information
type SessionInfo struct { // User session. Why: Tracks user (e.g., tier for model access).
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	Domain    string `json:"domain"`
	Language  string `json:"language"`
	UserTier  string `json:"user_tier"`
}

// Payload contains the actual request data
type Payload struct { // Input/output. Why: Carries task data (e.g., prompt).
	Input              PayloadInput       `json:"input"`
	OutputRequirements OutputRequirements `json:"output_requirements"`
}

// PayloadInput is the data to be processed
type PayloadInput struct { // Input details. Why: Handles various formats (text, image).
	Data      string `json:"data"`
	Format    string `json:"format"`
	Encoding  string `json:"encoding"`
	SizeBytes int    `json:"size_bytes"`
}

// OutputRequirements specifies desired output format
type OutputRequirements struct { // Output specs. Why: Controls response (e.g., max tokens).
	Format           string  `json:"format"`
	MaxTokens        int     `json:"max_tokens"`
	Temperature      float64 `json:"temperature"`
	QualityThreshold float64 `json:"quality_threshold"`
}

// Security contains security and privacy settings
type Security struct { // Security flags. Why: Enforces privacy (e.g., data class).
	DataClassification string `json:"data_classification"`
	UserConsent        bool   `json:"user_consent"`
	AuditRequired      bool   `json:"audit_required"`
}

// Metadata contains additional request information
type Metadata struct { // Extras. Why: Tracing/billing tags.
	TraceID        string            `json:"trace_id"`
	BillingAccount string            `json:"billing_account"`
	Tags           []string          `json:"tags"`
	CustomHeaders  map[string]string `json:"custom_headers"`
}

// ResponseStatus indicates success or failure
type ResponseStatus struct { // Status. Why: HTTP-like codes for responses.
	Code    int    `json:"code"`
	Message string `json:"message"`
	Success bool   `json:"success"`
}

// Result contains the AI model's output
type Result struct { // Output data. Why: Bundles model results with metrics.
	Data         string                 `json:"data"`
	Format       string                 `json:"format"`
	TokensUsed   int                    `json:"tokens_used"`
	ProcessingMs int                    `json:"processing_ms"`
	Quality      float64                `json:"quality"`
	ModelUsed    string                 `json:"model_used"`
	Metadata     map[string]interface{} `json:"metadata"`
}

// ResponseMetadata contains response-level information
type ResponseMetadata struct { // Response extras. Why: Tracks perf/cost post-task.
	TraceID     string    `json:"trace_id"`
	ProcessedAt time.Time `json:"processed_at"`
	CostInfo    CostUsage `json:"cost_info"`
}

// CostUsage tracks actual costs incurred
type CostUsage struct { // Actual costs. Why: Logs usage for optimization.
	TokenCost   float64 `json:"token_cost"`
	RequestCost float64 `json:"request_cost"`
	TotalCost   float64 `json:"total_cost"`
	Provider    string  `json:"provider"`
}

// ErrorInfo contains detailed error information
type ErrorInfo struct { // Error details. Why: Standardizes failures for retries.
	Code            string `json:"code"`
	Type            string `json:"type"`
	Message         string `json:"message"`
	RetryAfter      int    `json:"retry_after"`
	SuggestedAction string `json:"suggested_action"`
}
