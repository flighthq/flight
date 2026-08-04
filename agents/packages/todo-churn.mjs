// Source churn per package, from git, as the ground truth for "has this cell gone stale".
//
// The prior signal compared status.md dates against review.md dates. Status logging is VOLUNTARY, so
// that only ever measured work somebody remembered to write down: it flagged 37 cells when 115 had
// source committed after their review. Worse, it misranked — scene3d-gl (21.8k lines changed) and
// types (18.7k) were absent from the list entirely, while scene2d-wgpu (13.2k) showed up as the
// lowest-priority "1 day" entry because its log happened to carry one late line. Git cannot be
// forgotten, so it is what the liveness section ranks on.
//
// Commits, not lines, are the rank. A survey goes stale per distinct piece of work landed on top of
// it, and line count does not measure that: one generated-file rewrite is 22k lines a survey can
// still describe in a sentence, while forty focused commits are forty decisions it never saw. Lines
// stay alongside as the magnitude tiebreak.
//
// Costs ~5s over a couple of months of history — real, against a generator that was otherwise ~200ms,
// and accepted rather than cached: a stale cache inside the tool whose job is detecting staleness is
// the one bug this must not have. One `git log` for every package, never one per package (that shape
// took over two minutes).

import { execFileSync } from 'node:child_process';

// Commits and lines added+deleted per package, bucketed by commit date, for commits at or after
// `since`. Returns an empty map when git is unavailable or this is not a checkout, so the generator
// degrades to its other signals rather than failing.
//
// Commits are counted once per package per commit, not once per file: a commit touching six files in
// `mesh` is one piece of work that landed in mesh, and counting it six times would rank a wide
// refactor above six independent changes.
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
  let pending = new Map();

  // Attributes one commit once its full breadth is known, so a sweep can be recognized before it is
  // counted. Held to the end of the commit rather than streamed for exactly that reason.
  const flush = () => {
    if (date === null || pending.size === 0) return;
    for (const [name, delta] of pending) {
      const swept = isSweptCommit(pending.size, delta);
      const byDate = churn.get(name) ?? new Map();
      const bucket = byDate.get(date) ?? { commits: 0, lines: 0, sweeps: 0 };
      if (swept) bucket.sweeps += 1;
      else {
        bucket.commits += 1;
        bucket.lines += delta;
      }
      byDate.set(date, bucket);
      churn.set(name, byDate);
    }
    pending = new Map();
  };

  for (const line of out.split('\n')) {
    if (line.startsWith('C')) {
      flush();
      date = line.slice(1).trim() || null;
      continue;
    }
    if (date === null || line === '') continue;
    const [added, deleted, path] = line.split('\t');
    // A binary file reports '-' for both counts; it has no line delta to attribute.
    if (added === '-' || path === undefined) continue;
    const name = path.match(/^packages\/([^/]+)\//)?.[1];
    if (name === undefined) continue;
    pending.set(name, (pending.get(name) ?? 0) + Number(added) + Number(deleted));
  }
  flush();
  return churn;
}

// Commits and lines landed in one package strictly after `since`. Dates are YYYY-MM-DD, so lexical
// comparison is date comparison. A review dated the same day as a commit is treated as having seen it.
export function sumChurnSince(byDate, since) {
  const total = { commits: 0, lines: 0, sweeps: 0 };
  if (byDate === undefined) return total;
  for (const [date, bucket] of byDate) {
    if (date <= since) continue;
    total.commits += bucket.commits;
    total.lines += bucket.lines;
    total.sweeps += bucket.sweeps;
  }
  return total;
}

// Whether one commit reached a package only as a sweep, given how many packages the commit touched
// and how many lines this package received. Shared with the status drafter so the ranking and the
// draft can never disagree about what counts as work on a package.
//
// Sweep detection is in two parts, because neither half works alone.
//
// Breadth first: a commit touching more packages than this is usually repo-wide — a version bump, a
// lint rule, a mechanical rename — not work done *on* any one package, and counting it as such
// buries the cells that saw real work (it put the whole platform-integration suite on the re-review
// list, at three commits each, when none of them had been touched by hand in a month).
//
// But breadth alone is not the tell, and the earlier claim that it was — a clean bimodal gap between
// focused work and sweeps — does not survive the log: `refactor(texture): flatten texture source
// model` spans 24 packages and is real design work. So breadth only *opens the question*, and the
// owner share settles it: in a wide commit the package that owns the change takes hundreds of lines
// while its consumers take a call-site edit apiece. Requiring that share keeps the texture refactor
// counted for `texture` and drops it for the 23 packages that merely followed.
export function isSweptCommit(packageCount, packageLines) {
  return packageCount > SWEEP_PACKAGE_BREADTH && packageLines < SWEEP_OWNER_LINES;
}

const SWEEP_OWNER_LINES = 50;
const SWEEP_PACKAGE_BREADTH = 20;
