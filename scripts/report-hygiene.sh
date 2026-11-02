#!/usr/bin/env bash
# Turns hygiene step outcomes into warnings and a run-summary table without failing the job.
#
# Usage: OUTCOMES="name=outcome name=outcome ..." scripts/report-hygiene.sh
# Each outcome is a GitHub step outcome: success, failure, cancelled, or skipped (an empty value,
# from a step that never ran, also reads as skipped).
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
failed=0
{
  echo '| Check | Result |'
  echo '| --- | --- |'
} >> "$summary"

for pair in ${OUTCOMES:-}; do
  name="${pair%%=*}"
  outcome="${pair#*=}"
  case "$outcome" in
    success) result='passed' ;;
    failure)
      result='**failed** (see the step log)'
      failed=$((failed + 1))
      echo "::warning title=Hygiene: ${name}::${name} failed. Hygiene never fails CI; see this step's log."
      ;;
    cancelled) result='cancelled' ;;
    *) result='skipped' ;;
  esac
  echo "| \`${name}\` | ${result} |" >> "$summary"
done

echo "hygiene: ${failed} check(s) failed"
exit 0
