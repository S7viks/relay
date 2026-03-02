# PowerShell Test Runner for GAIOL
# This script runs all tests and generates a report

Write-Host "🧪 GAIOL Reasoning Engine - Test Suite" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Change to the GAIOL subdirectory
Set-Location "GAIOL"

# Test counter
$totalTests = 0
$passedTests = 0
$failedTests = 0

# Test categories
$testPackages = @(
    @{Name="Core Types"; Path="./internal/reasoning"; Pattern="TestSharedMemory|TestMetricScores|TestPathNode|TestConsensus|TestSessionConfig"},
    @{Name="Memory Manager"; Path="./internal/reasoning"; Pattern="TestMemoryManager|TestCreateAndGetSession|TestUpdateStepResults|TestUpdateBeamResults"},
    @{Name="Scorer"; Path="./internal/reasoning"; Pattern="TestCalculateWeightedScore|TestCleanJSON|TestMetricScoresBounds|TestQualityProfile|TestSpeedProfile"},
    @{Name="Critic"; Path="./internal/reasoning"; Pattern="TestCriticFeedback|TestReflectionConfig|TestExtractJSON|TestBuildContextSummary"},
    @{Name="Consensus"; Path="./internal/reasoning"; Pattern="TestConsensusConfig|TestSimpleSimilarity|TestCalculateAgreement|TestReconcile"},
    @{Name="Decomposer"; Path="./internal/reasoning"; Pattern="TestDecomposer"}
)

Write-Host "Running Unit Tests..." -ForegroundColor Yellow
Write-Host ""

foreach ($category in $testPackages) {
    Write-Host "Testing: $($category.Name)" -ForegroundColor Green
    
    $result = go test -v $category.Path -run $category.Pattern 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passedTests++
    } else {
        Write-Host "  ✗ FAILED" -ForegroundColor Red
        Write-Host $result -ForegroundColor DarkGray
        $failedTests++
    }
    $totalTests++
    Write-Host ""
}

Write-Host ""
Write-Host "Running Full Test Suite..." -ForegroundColor Yellow
go test ./internal/reasoning -v

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "Total Test Categories: $totalTests" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $failedTests" -ForegroundColor Red

if ($failedTests -eq 0) {
    Write-Host ""
    Write-Host "✓ All tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "✗ Some tests failed. Check output above." -ForegroundColor Red
    exit 1
}
