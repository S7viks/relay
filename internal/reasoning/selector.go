package reasoning

import (
	"fmt"
)

// Selector handles path selection logic
type Selector struct {
	Algorithm string // greedy, beam
}

// NewSelector creates a new selector
func NewSelector(algo string) *Selector {
	return &Selector{
		Algorithm: algo,
	}
}

// SelectBestOutput picks the winning output based on score
func (s *Selector) SelectBestOutput(outputs []ModelOutput) (*ModelOutput, error) {
	if len(outputs) == 0 {
		return nil, fmt.Errorf("no outputs to select from")
	}

	var best *ModelOutput
	maxScore := -1.0

	for i := range outputs {
		if outputs[i].Scores.Overall > maxScore {
			maxScore = outputs[i].Scores.Overall
			best = &outputs[i]
		}
	}

	return best, nil
}

// Composer handles final output assembly
type Composer struct{}

// NewComposer creates a new composer
func NewComposer() *Composer {
	return &Composer{}
}

// AssembleFinalOutput merges the selected path into a final response
func (c *Composer) AssembleFinalOutput(path []ModelOutput) string {
	var finalResponse string
	for _, output := range path {
		finalResponse += output.Response + "\n\n"
	}
	return finalResponse
}
