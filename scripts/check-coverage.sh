COVERAGE_FILE="coverage/coverage-summary.json"

# Ensure the coverage file exists
if [ ! -f "$COVERAGE_FILE" ]; then
  echo "❌ Coverage report not found at $COVERAGE_FILE. Ensure tests generate coverage."
  exit 1
fi

# Extract the coverage percentage
COVERAGE=$(jq '.total.statements.pct' "$COVERAGE_FILE")
echo "Extracted Coverage: $COVERAGE%"

# Set the minimum required coverage
MIN_COVERAGE=70

# Compare and enforce coverage
if (( $(echo "$COVERAGE < $MIN_COVERAGE" | bc -l) )); then
  echo "❌ Code coverage is below $MIN_COVERAGE%. PR cannot be merged."
  exit 1
else
  echo "✅ Code coverage is sufficient."
fi