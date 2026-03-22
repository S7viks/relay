package v1

import (
	"fmt"
	"strings"
)

var allowedTaskKinds = map[string]struct{}{
	"qa": {}, "code": {}, "summarization": {}, "reasoning": {}, "creative": {}, "tool_use": {}, "unknown": {},
}

var allowedRoles = map[string]struct{}{
	"system": {}, "user": {}, "assistant": {}, "tool": {},
}

var allowedConsensus = map[string]struct{}{
	"uniform": {}, "static": {}, "abtc": {},
}

// ValidateOrchestrateRequestV1 performs minimal structural checks after JSON decode.
// JSON Schema is enforced in tests against orchestrator/contract/schemas/v1.
func ValidateOrchestrateRequestV1(r *OrchestrateRequestV1) error {
	if r == nil {
		return fmt.Errorf("request is nil")
	}
	if r.SchemaVersion != "1.0" {
		return fmt.Errorf("schema_version must be 1.0, got %q", r.SchemaVersion)
	}
	if strings.TrimSpace(r.TraceID) == "" {
		return fmt.Errorf("trace_id is required")
	}
	if strings.TrimSpace(r.Domain) == "" {
		return fmt.Errorf("domain is required")
	}
	if _, ok := allowedTaskKinds[r.TaskKind]; !ok {
		return fmt.Errorf("invalid task_kind %q", r.TaskKind)
	}
	if len(r.Messages) == 0 {
		return fmt.Errorf("messages must be non-empty")
	}
	for i, m := range r.Messages {
		if _, ok := allowedRoles[m.Role]; !ok {
			return fmt.Errorf("messages[%d]: invalid role %q", i, m.Role)
		}
	}
	if r.ConsensusMode != "" {
		if _, ok := allowedConsensus[r.ConsensusMode]; !ok {
			return fmt.Errorf("invalid consensus_mode %q", r.ConsensusMode)
		}
	}
	return nil
}

// ValidateOrchestrateResponseV1 performs minimal checks after JSON decode from the TS service.
func ValidateOrchestrateResponseV1(r *OrchestrateResponseV1) error {
	if r == nil {
		return fmt.Errorf("response is nil")
	}
	if r.SchemaVersion != "1.0" {
		return fmt.Errorf("schema_version must be 1.0, got %q", r.SchemaVersion)
	}
	if strings.TrimSpace(r.TraceID) == "" {
		return fmt.Errorf("trace_id is required")
	}
	if r.TrustUpdates == nil {
		return fmt.Errorf("trust_updates must be present (use empty array)")
	}
	for i, u := range r.TrustUpdates {
		if u.SchemaVersion != "1.0" {
			return fmt.Errorf("trust_updates[%d]: schema_version must be 1.0", i)
		}
		if u.Event != "trust_updated" {
			return fmt.Errorf("trust_updates[%d]: event must be trust_updated", i)
		}
		if u.Distribution.Alpha <= 0 || u.Distribution.Beta <= 0 {
			return fmt.Errorf("trust_updates[%d]: alpha and beta must be > 0", i)
		}
	}
	return nil
}
