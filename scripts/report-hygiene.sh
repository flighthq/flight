#!/usr/bin/env bash
# Turns advisory step outcomes into warnings and a run-summary table without failing the job. Used by
# the Hygiene workflow and the advisory Host platform probes.
#
# Usage: [REPORT_AREA=Host] OUTCOMES="name=outcome name=outcome ..." scripts/report-hygiene.sh
# REPORT_AREA labels the warnings (default: Hygiene).
# Each outcome is a GitHub step outcome: success, failure, cancelled, or skipped (an empty value,
# from a step that never ran, also reads as skipped).
set -uo pipefail

summary="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
area="${REPORT_AREA:-Hygiene}"
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
      echo "::warning title=${area}: ${name}::${name} failed. ${area} is advisory and never fails the run; see the step log."
      ;;
    cancelled) result='cancelled' ;;
    *) result='skipped' ;;
  esac
  echo "| \`${name}\` | ${result} |" >> "$summary"
done

echo "${area}: ${failed} advisory check(s) failed"
exit 0
