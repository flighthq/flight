#!/usr/bin/env bash
# Moves a branch on `origin` forward to a commit, and never anywhere else. Used by the promotions
# (CI: develop → next; Nightly: next → main).
#
# Usage: scripts/fast-forward-branch.sh <branch> <commit>
#
#   branch absent             → created at the commit
#   branch already contains   → nothing to do (a newer promotion got there first, or a re-run)
#   commit extends the branch → pushed as a fast-forward, then re-read to confirm
#   neither contains the other → error: the histories diverged, and a human must decide
#
# Writes `advanced=true|false` to $GITHUB_OUTPUT when set, so a caller can act only on a real move.
set -euo pipefail

branch="${1:?branch required}"
commit="${2:?commit required}"
output="${GITHUB_OUTPUT:-/dev/null}"

git cat-file -e "${commit}^{commit}" 2>/dev/null || git fetch --no-tags origin "$commit"
remote=$(git ls-remote origin "refs/heads/${branch}" | cut -f1)

if [ -z "$remote" ]; then
  git push origin "${commit}:refs/heads/${branch}"
  echo "Created ${branch} at ${commit}."
  echo 'advanced=true' >> "$output"
  exit 0
fi

git fetch --no-tags origin "+refs/heads/${branch}:refs/remotes/origin/${branch}"

if git merge-base --is-ancestor "$commit" "$remote"; then
  echo "${branch} is at ${remote}, which already contains ${commit}; nothing to do."
  echo 'advanced=false' >> "$output"
  exit 0
fi

if ! git merge-base --is-ancestor "$remote" "$commit"; then
  echo "::error::${branch} (${remote}) and ${commit} have diverged; refusing to move ${branch}. A human must reconcile them."
  exit 1
fi

git push origin "${commit}:refs/heads/${branch}"

# Re-read rather than trusting the exit status: callers treat `advanced=true` as a claim that the
# branch NOW points at this commit.
after=$(git ls-remote origin "refs/heads/${branch}" | cut -f1)
if [ "$after" != "$commit" ]; then
  echo "::error::pushed ${commit} but origin/${branch} is at ${after}."
  exit 1
fi
echo "${branch} advanced ${remote} -> ${commit}."
echo 'advanced=true' >> "$output"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "### ${branch} → \`${commit}\` $(git log -1 --format='%s' "$commit")" >> "$GITHUB_STEP_SUMMARY"
fi
