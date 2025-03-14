COVERAGE_FILE="coverage/coverage-summary.json"
BADGE_FILE="coverage-report/coverage-badge.json"

# Ensure the coverage report exists
if [ ! -f "$COVERAGE_FILE" ]; then
  echo "❌ Coverage report not found at $COVERAGE_FILE. Ensure tests generate coverage."
  exit 1
fi

# Extract the coverage percentage
COVERAGE=$(jq '.total.statements.pct' "$COVERAGE_FILE")

# Determine badge color
COLOR="red"
if (( $(echo "$COVERAGE > 80" | bc -l) )); then
  COLOR="green"
elif (( $(echo "$COVERAGE > 50" | bc -l) )); then
  COLOR="yellow"
fi

# Generate Shields.io-compatible JSON
mkdir -p coverage-report
echo '{
  "schemaVersion": 1,
  "label": "coverage",
  "message": "'"$COVERAGE"'%",
  "color": "'"$COLOR"'"
}' > "$BADGE_FILE"

echo "✅ Coverage badge generated at $BADGE_FILE"