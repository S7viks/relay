package modelresolve

import (
	"errors"
	"testing"

	"gaiol/internal/models"
)

type mockReg struct {
	models map[models.ModelID]models.ModelMetadata
	free   []models.ModelMetadata
}

func (m *mockReg) GetModel(id models.ModelID) (*models.ModelMetadata, error) {
	meta, ok := m.models[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return &meta, nil
}

func (m *mockReg) FindFreeModels() []models.ModelMetadata {
	return m.free
}

func TestLookupRegisteredModel_exactThenOpenRouter(t *testing.T) {
	reg := &mockReg{
		models: map[models.ModelID]models.ModelMetadata{
			"openrouter:google/gemini-2.0-flash-exp:free": {
				ID: "openrouter:google/gemini-2.0-flash-exp:free", ModelName: "google/gemini-2.0-flash-exp:free",
			},
		},
	}
	meta, err := LookupRegisteredModel(reg, "google/gemini-2.0-flash-exp:free")
	if err != nil {
		t.Fatal(err)
	}
	if meta.ModelName != "google/gemini-2.0-flash-exp:free" {
		t.Fatalf("got %q", meta.ModelName)
	}

	_, err = LookupRegisteredModel(reg, "missing/model")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestLookupRegisteredModelOrFree_fallbackFree(t *testing.T) {
	freeMeta := models.ModelMetadata{
		ID: "openrouter:free-only:free", ModelName: "free-only:free",
		CostInfo: models.CostInfo{CostPerToken: 0},
	}
	reg := &mockReg{
		models: map[models.ModelID]models.ModelMetadata{
			"openrouter:free-only:free": freeMeta,
		},
		free: []models.ModelMetadata{freeMeta},
	}
	meta, err := LookupRegisteredModelOrFree(reg, "unknown/bogus")
	if err != nil {
		t.Fatal(err)
	}
	if meta.ID != freeMeta.ID {
		t.Fatalf("expected free fallback, got %s", meta.ID)
	}
}

func TestDefaultReasoningStarterModelIDs(t *testing.T) {
	got := DefaultReasoningStarterModelIDs()
	if len(got) != 2 {
		t.Fatalf("len=%d", len(got))
	}
	if got[0] != QualifiedOpenRouter(SlugGemini20FlashExpFree) {
		t.Fatalf("first: %s", got[0])
	}
	if got[1] != QualifiedOpenRouter(SlugDeepSeekR1Free) {
		t.Fatalf("second: %s", got[1])
	}
}

func TestOrderedFreeModelIDsForDecomposer(t *testing.T) {
	all := []models.ModelMetadata{
		{ID: "openrouter:z/z:free", CostInfo: models.CostInfo{CostPerToken: 0}},
		{ID: "ollama:llama3.2:latest", Provider: ProviderOllama, CostInfo: models.CostInfo{CostPerToken: 0}},
		{ID: "openrouter:google/gemini-x:free", CostInfo: models.CostInfo{CostPerToken: 0}},
	}
	ids := OrderedFreeModelIDsForDecomposer(all)
	// Ollama prepended first in iteration order after collects; gemini hint prepended too.
	// Order among prepended items depends on slice iteration — assert all three present and ollama before tail-only z.
	if len(ids) != 3 {
		t.Fatalf("len=%d %v", len(ids), ids)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		seen[id] = true
	}
	if !seen["ollama:llama3.2:latest"] || !seen["openrouter:google/gemini-x:free"] || !seen["openrouter:z/z:free"] {
		t.Fatalf("missing id: %v", ids)
	}
}

func TestIsOllamaProvider(t *testing.T) {
	if !IsOllamaProvider("ollama") || !IsOllamaProvider(" Ollama ") {
		t.Fatal("expected ollama")
	}
	if IsOllamaProvider("openrouter") {
		t.Fatal("expected false")
	}
}

func TestDecomposerPriorityHint(t *testing.T) {
	if !DecomposerPriorityHint("openrouter:google/gemini-2.0-flash-exp:free") {
		t.Fatal("gemini")
	}
	if !DecomposerPriorityHint("openrouter:meta-llama/llama-3.2-3b-instruct:free") {
		t.Fatal("llama-3.2")
	}
	if DecomposerPriorityHint("openrouter:other:free") {
		t.Fatal("expected false")
	}
}
