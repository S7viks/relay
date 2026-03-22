package v1

// Wire DTOs for GAIOL orchestration contract v1 (JSON, snake_case).
// Canonical schemas: orchestrator/contract/schemas/v1/*.schema.json

type ChatMessageV1 struct {
	Role    string `json:"role"`
	Content string `json:"content"`
	Name    string `json:"name,omitempty"`
}

type TaskConstraintsV1 struct {
	MaxCostUsd          *float64 `json:"max_cost_usd,omitempty"`
	MaxLatencyMsPerCall *int     `json:"max_latency_ms_per_call,omitempty"`
	MaxParallelCalls    *int     `json:"max_parallel_calls,omitempty"`
	Temperature         *float64 `json:"temperature,omitempty"`
	MaxOutputTokens     *int     `json:"max_output_tokens,omitempty"`
}

type OrchestrateRequestV1 struct {
	SchemaVersion string             `json:"schema_version"`
	TraceID       string             `json:"trace_id"`
	SessionID     string             `json:"session_id,omitempty"`
	Domain        string             `json:"domain"`
	TaskKind      string             `json:"task_kind"`
	Objective     string             `json:"objective"`
	Messages      []ChatMessageV1    `json:"messages"`
	Constraints   *TaskConstraintsV1 `json:"constraints,omitempty"`
	ExplorePaths  *bool              `json:"explore_paths,omitempty"`
	BeamWidth     *int               `json:"beam_width,omitempty"`
	ConsensusMode string             `json:"consensus_mode,omitempty"`
}

type BetaDistributionV1 struct {
	Alpha float64 `json:"alpha"`
	Beta  float64 `json:"beta"`
}

type TrustUpdateEventV1 struct {
	SchemaVersion          string              `json:"schema_version"`
	Event                  string              `json:"event"`
	TraceID                string              `json:"trace_id"`
	SessionID              string              `json:"session_id,omitempty"`
	Domain                 string              `json:"domain"`
	ModelID                string              `json:"model_id"`
	ProviderID             string              `json:"provider_id"`
	Distribution           BetaDistributionV1  `json:"distribution"`
	UpdatedAt              string              `json:"updated_at"`
	SubtaskID              string              `json:"subtask_id,omitempty"`
	PriorDistribution      *BetaDistributionV1 `json:"prior_distribution,omitempty"`
	AfterDecayDistribution *BetaDistributionV1 `json:"after_decay_distribution,omitempty"`
	PriorMean              *float64            `json:"prior_mean,omitempty"`
	PosteriorMean          *float64            `json:"posterior_mean,omitempty"`
	Decay                  *float64            `json:"decay,omitempty"`
	Strength               *float64            `json:"strength,omitempty"`
	Signal                 *float64            `json:"signal,omitempty"`
	Role                   string              `json:"role,omitempty"`
	Explanation            string              `json:"explanation,omitempty"`
}

type ModelCallUsageV1 struct {
	PromptTokens     *int     `json:"prompt_tokens,omitempty"`
	CompletionTokens *int     `json:"completion_tokens,omitempty"`
	CostUsd          *float64 `json:"cost_usd,omitempty"`
}

type ModelCallV1 struct {
	ModelID    string             `json:"model_id"`
	ProviderID string             `json:"provider_id"`
	Text       string             `json:"text"`
	LatencyMs  int64              `json:"latency_ms"`
	Usage      *ModelCallUsageV1 `json:"usage,omitempty"`
	Error      string             `json:"error,omitempty"`
}

type PathCandidateTraceV1 struct {
	PathID      string  `json:"path_id"`
	ModelID     string  `json:"model_id"`
	ProviderID  string  `json:"provider_id"`
	Score       float64 `json:"score"`
	Kept        bool    `json:"kept"`
	TextPreview string  `json:"text_preview"`
}

type BeamPruneTraceV1 struct {
	BeamWidth        int      `json:"beam_width"`
	KeptPathIDs      []string `json:"kept_path_ids"`
	DiscardedPathIDs []string `json:"discarded_path_ids"`
}

type RoutingRankBreakdownV1 struct {
	Accuracy        float64 `json:"accuracy"`
	Latency         float64 `json:"latency"`
	Cost            float64 `json:"cost"`
	Availability    float64 `json:"availability"`
	CapabilityMatch float64 `json:"capability_match"`
}

type RoutingRankRowV1 struct {
	ModelID      string                 `json:"model_id"`
	ProviderID   string                 `json:"provider_id"`
	RoutingScore float64                `json:"routing_score"`
	Breakdown    RoutingRankBreakdownV1 `json:"breakdown"`
}

type RoutingExplanationTraceV1 struct {
	DiversityRationale string             `json:"diversity_rationale"`
	CandidatePoolSize  int                `json:"candidate_pool_size"`
	BeamWidth          int                `json:"beam_width"`
	ModelRankSnapshot  []RoutingRankRowV1 `json:"model_rank_snapshot"`
}

type PathExplorationTraceV1 struct {
	Candidates    []PathCandidateTraceV1 `json:"candidates"`
	Pruning       BeamPruneTraceV1       `json:"pruning"`
	WinningPathID string                 `json:"winning_path_id"`
}

type TrustRoundEntryTraceV1 struct {
	ModelID       string             `json:"model_id"`
	ProviderID    string             `json:"provider_id"`
	Domain        string             `json:"domain"`
	Role          string             `json:"role"`
	Prior         BetaDistributionV1 `json:"prior"`
	AfterDecay    BetaDistributionV1 `json:"after_decay"`
	Posterior     BetaDistributionV1 `json:"posterior"`
	PriorMean     float64            `json:"prior_mean"`
	PosteriorMean float64            `json:"posterior_mean"`
	Decay         float64            `json:"decay"`
	Strength      float64            `json:"strength"`
	Signal        float64            `json:"signal"`
	Explanation   string             `json:"explanation"`
	Persisted     bool               `json:"persisted"`
}

type TrustRoundTraceV1 struct {
	ConsensusMode          string                   `json:"consensus_mode"`
	WinnerModelID          string                   `json:"winner_model_id"`
	SubtaskID              string                   `json:"subtask_id"`
	Decay                  float64                  `json:"decay"`
	StrengthWinner         float64                  `json:"strength_winner"`
	StrengthParticipant    float64                  `json:"strength_participant"`
	ConsensusTrustExponent *float64                 `json:"consensus_trust_exponent,omitempty"`
	Entries                []TrustRoundEntryTraceV1 `json:"entries"`
}

type SubtaskTraceV1 struct {
	SubtaskID          string                     `json:"subtask_id"`
	RoutedModelIDs     []string                   `json:"routed_model_ids"`
	Calls              []ModelCallV1              `json:"calls"`
	Scores             map[string]float64         `json:"scores"`
	ChosenModelID      string                     `json:"chosen_model_id,omitempty"`
	ConsensusText      string                     `json:"consensus_text,omitempty"`
	PathExploration    *PathExplorationTraceV1    `json:"path_exploration,omitempty"`
	RoutingExplanation *RoutingExplanationTraceV1 `json:"routing_explanation,omitempty"`
	TrustRound         *TrustRoundTraceV1         `json:"trust_round,omitempty"`
}

type SubtaskSpecV1 struct {
	ID                   string   `json:"id"`
	ParentID             string   `json:"parent_id,omitempty"`
	Title                string   `json:"title"`
	Description          string   `json:"description"`
	TaskKind             string   `json:"task_kind"`
	RequiredCapabilities []string `json:"required_capabilities,omitempty"`
}

type DecompositionV1 struct {
	Subtasks  []SubtaskSpecV1 `json:"subtasks"`
	Rationale string          `json:"rationale,omitempty"`
}

type OrchestrationTraceV1 struct {
	TraceID       string           `json:"trace_id"`
	Domain        string           `json:"domain"`
	Decomposition DecompositionV1  `json:"decomposition"`
	Subtasks      []SubtaskTraceV1 `json:"subtasks"`
	StartedAt     string           `json:"started_at"`
	FinishedAt    string           `json:"finished_at"`
}

type OrchestrateResponseV1 struct {
	SchemaVersion string               `json:"schema_version"`
	TraceID       string               `json:"trace_id"`
	SessionID     string               `json:"session_id,omitempty"`
	Answer        string               `json:"answer"`
	Trace         OrchestrationTraceV1 `json:"trace"`
	TrustUpdates  []TrustUpdateEventV1 `json:"trust_updates"`
}
