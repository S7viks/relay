package uaip

// UAIP Protocol Version
const (
	ProtocolVersion = "2.0"
)

// Message Types
const (
	MessageTypeTaskRequest  = "task_request"
	MessageTypeTaskResponse = "task_response"
	MessageTypeError        = "error"
	MessageTypeHeartbeat    = "heartbeat"
)

// Task Types (matching models package)
const (
	TaskTypeGenerate  = "generate"
	TaskTypeAnalyze   = "analyze"
	TaskTypeSummarize = "summarize"
	TaskTypeTransform = "transform"
	TaskTypeClassify  = "classify"
	TaskTypeCode      = "code"
	TaskTypeVision    = "vision"
)

// Priority Levels
const (
	PriorityLow      = 1
	PriorityMedium   = 2
	PriorityHigh     = 3
	PriorityCritical = 4
)

// Response Status Codes
const (
	StatusOK                 = 200
	StatusBadRequest         = 400
	StatusUnauthorized       = 401
	StatusForbidden          = 403
	StatusNotFound           = 404
	StatusTooManyRequests    = 429
	StatusInternalError      = 500
	StatusServiceUnavailable = 503
	StatusTimeout            = 504
)

// Error Types
const (
	ErrorTypeAuthentication   = "authentication"
	ErrorTypeAuthorization    = "authorization"
	ErrorTypeValidation       = "validation"
	ErrorTypeTimeout          = "timeout"
	ErrorTypeCapacity         = "capacity"
	ErrorTypeInternal         = "internal"
	ErrorTypeRateLimit        = "rate_limit"
	ErrorTypeModelUnavailable = "model_unavailable"
	ErrorCodeAuthError        = "auth_error"
)

// Error Codes
const (
	ErrorCodeInvalidRequest   = "UAIP_4000"
	ErrorCodeAuthFailed       = "UAIP_4001"
	ErrorCodeInsufficientAuth = "UAIP_4003"
	ErrorCodeRateLimit        = "UAIP_4029"
	ErrorCodeInternalError    = "UAIP_5000"
	ErrorCodeServiceDown      = "UAIP_5003"
	ErrorCodeTimeout          = "UAIP_5004"
	ErrorCodeModelNotFound    = "UAIP_4004"
	ErrorCodeInvalidModel     = "UAIP_4006"
)

// Fallback Strategies
const (
	FallbackFreFirst    = "free_first"
	FallbackBestQuality = "best_quality"
	FallbackFastest     = "fastest"
	FallbackCheapest    = "cheapest"
	FallbackFailFast    = "fail_fast"
)

// Data Classifications
const (
	DataClassPublic       = "public"
	DataClassInternal     = "internal"
	DataClassConfidential = "confidential"
	DataClassRestricted   = "restricted"
)

// User Tiers
const (
	UserTierFree       = "free"
	UserTierPro        = "pro"
	UserTierEnterprise = "enterprise"
)

// Default Values
const (
	DefaultTimeoutMs   = 30000 // 30 seconds
	DefaultMaxTokens   = 1000
	DefaultTemperature = 0.7
	DefaultTTL         = 300 // 5 minutes
	DefaultPriority    = PriorityMedium
)
