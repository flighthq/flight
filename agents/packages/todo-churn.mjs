// Source churn per package, from git, as the ground truth for "has this cell gone stale".
//
// The prior signal compared status.md dates against review.md dates. Status logging is VOLUNTARY, so
// that only ever measured work somebody remembered to write down: it flagged 37 cells when 115 had
// source committed after their review. Worse, it misranked — scene3d-gl (21.8k lines changed) and
// types (18.7k) were absent from the list entirely, while scene2d-wgpu (13.2k) showed up as the
// lowest-priority "1 day" entry because its log happened to carry one late line. Git cannot be
// forgotten, so it is what the liveness section ranks on.
//
// Costs ~5s over a couple of months of history — real, against a generator that was otherwise ~200ms,
// and accepted rather than cached: a stale cache inside the tool whose job is detecting staleness is
// the one bug this must not have. One `git log` for every package, never one per package (that shape
// took over two minutes).

import { execFileSync } from 'node:child_process';

// Total lines added+deleted per package, bucketed by commit date, for commits at or after `since`.
// Returns an empty map when git is unavailable or this is not a checkout, so the generator degrades
// to its other signals rather than failing.
export function readPackageChurn(repoRoot, since) {
  let out;
  try {
    out = execFileSync(
      'git',
      ['log', `--since=${since}`, '--no-renames', '--numstat', '--format=C%cs', '--', 'packages'],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch {
    return new Map();
  }

  const churn = new Map();
  let date = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('C')) {
      date = line.slice(1).trim() || null;
      continue;
    }
    if (date === null || line === '') continue;
    const [added, deleted, path] = line.split('\t');
    // A binary file reports '-' for both counts; it has no line delta to attribute.
    if (added === '-' || path === undefined) continue;
    const name = path.match(/^packages\/([^/]+)\//)?.[1];
    if (name === undefined) continue;
    const byDate = churn.get(name) ?? new Map();
    byDate.set(date, (byDate.get(date) ?? 0) + Number(added) + Number(deleted));
    churn.set(name, byDate);
  }
  return churn;
}

// Lines changed in one package strictly after `since`. Dates are YYYY-MM-DD, so lexical comparison is
// date comparison. A review dated the same day as a commit is treated as having seen it.
export function sumChurnSince(byDate, since) {
  if (byDate === undefined) return 0;
  let total = 0;
  for (const [date, lines] of byDate) {
    if (date > since) total += lines;
  }
  return total;
}
