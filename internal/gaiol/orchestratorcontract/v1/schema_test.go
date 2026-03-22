package v1

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

func moduleRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("go.mod not found from test working directory")
		}
		dir = parent
	}
}

func compileSchema(t *testing.T, relativePathFromModuleRoot string) *jsonschema.Schema {
	t.Helper()
	root := moduleRoot(t)
	p := filepath.Join(root, filepath.FromSlash(relativePathFromModuleRoot))
	raw, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read schema %s: %v", p, err)
	}
	c := jsonschema.NewCompiler()
	c.Draft = jsonschema.Draft2020
	loc := "file://" + filepath.ToSlash(p)
	if err := c.AddResource(loc, bytes.NewReader(raw)); err != nil {
		t.Fatalf("add resource: %v", err)
	}
	sch, err := c.Compile(loc)
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	return sch
}

func TestJSONSchema_OrchestrateRequestV1_Fixture(t *testing.T) {
	sch := compileSchema(t, "orchestrator/contract/schemas/v1/orchestrate-request.schema.json")
	req := &OrchestrateRequestV1{
		SchemaVersion: "1.0",
		TraceID:       "550e8400-e29b-41d4-a716-446655440000",
		SessionID:     "sess-1",
		Domain:        "general",
		TaskKind:      "qa",
		Objective:     "Hello",
		Messages:      []ChatMessageV1{{Role: "user", Content: "Hello"}},
		ConsensusMode: "abtc",
	}
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	var instance any
	if err := json.Unmarshal(b, &instance); err != nil {
		t.Fatal(err)
	}
	if err := sch.Validate(instance); err != nil {
		t.Fatal(err)
	}
}

func TestJSONSchema_OrchestrateResponseV1_Fixture(t *testing.T) {
	sch := compileSchema(t, "orchestrator/contract/schemas/v1/orchestrate-response.schema.json")
	out := OrchestrateResponseV1{
		SchemaVersion: "1.0",
		TraceID:       "550e8400-e29b-41d4-a716-446655440000",
		Answer:        "ok",
		Trace: OrchestrationTraceV1{
			TraceID: "550e8400-e29b-41d4-a716-446655440000",
			Domain:  "general",
			Decomposition: DecompositionV1{
				Subtasks: []SubtaskSpecV1{
					{ID: "s1", Title: "t", Description: "d", TaskKind: "qa"},
				},
			},
			Subtasks: []SubtaskTraceV1{
				{
					SubtaskID:      "s1",
					RoutedModelIDs: []string{"m1"},
					Calls: []ModelCallV1{
						{ModelID: "m1", ProviderID: "mock", Text: "x", LatencyMs: 2},
					},
					Scores: map[string]float64{"m1": 0.5},
				},
			},
			StartedAt:  "2020-01-01T00:00:00.000Z",
			FinishedAt: "2020-01-01T00:00:01.000Z",
		},
		TrustUpdates: []TrustUpdateEventV1{},
	}
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatal(err)
	}
	var instance any
	if err := json.Unmarshal(b, &instance); err != nil {
		t.Fatal(err)
	}
	if err := sch.Validate(instance); err != nil {
		t.Fatal(err)
	}
}
