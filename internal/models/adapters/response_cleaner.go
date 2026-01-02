package adapters

import (
    "strings"
)

// ResponseCleaner handles model-specific response formatting
type ResponseCleaner struct{}

func NewResponseCleaner() *ResponseCleaner {
    return &ResponseCleaner{}
}
// Add to your OpenRouter adapter



func (rc *ResponseCleaner) CleanQwQResponse(content string) string {
    // Remove reasoning artifacts from QwQ responses
    lines := strings.Split(content, "\n")
    var cleanLines []string
    
    skipPhrases := []string{
        "the user", "let me", "i need to", "i should", "let's", 
        "okay,", "well,", "hmm", "i think", "maybe", "probably",
    }
    
    for _, line := range lines {
        line = strings.TrimSpace(line)
        if len(line) < 10 {
            continue
        }
        
        lineToCheck := strings.ToLower(line)
        shouldSkip := false
        
        for _, phrase := range skipPhrases {
            if strings.Contains(lineToCheck, phrase) {
                shouldSkip = true
                break
            }
        }
        
        if !shouldSkip {
            cleanLines = append(cleanLines, line)
        }
    }
    
    // Join and limit to reasonable length
    result := strings.Join(cleanLines, " ")
    if len(result) > 300 {
        sentences := strings.Split(result, ".")
        if len(sentences) >= 3 {
            result = sentences[0] + "." + sentences[1] + "." + sentences[2] + "."
        }
    }
    
    return strings.TrimSpace(result)
}

func (rc *ResponseCleaner) CleanGeminiResponse(content string) string {
    // Gemini responses are usually clean, just trim
    return strings.TrimSpace(content)
}

func (rc *ResponseCleaner) AutoClean(content, modelName string) string {
    if strings.Contains(modelName, "qwq") || strings.Contains(modelName, "deepseek") {
        return rc.CleanQwQResponse(content)
    }
    return rc.CleanGeminiResponse(content)
}
