// Drafts a status.md entry for a cell from the commit subjects landed since its review.
//
// The gap this closes: 15 cells carry 10+ commits since their review and zero status entries, so the
// next agent inherits the code with no continuity prose. But the record is not missing — it is in
// git, and it is already good. `scene3d-gl` alone reads as a coherent narrative in its subjects:
// complete directional shadow pass contracts -> scale normal bias by shadow texels -> bound
// directional PCF cost. Having an agent reconstruct that by reading diffs pays to rewrite something
// that already exists.
//
// So this prints a DRAFT to stdout and never writes status.md. status.md is continuity prose — what
// is half-done, the gotcha hit, the dangling thread — and a verbatim commit dump would turn it into
// a second copy of the changelog, which is the duplication the derived-date lesson warns about. The
// agent visiting the cell compresses this into prose and keeps only what survives the summary.
//
// Usage: node agents/packages/status-draft.mjs <cell> [<cell>...] [--since=YYYY-MM-DD]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSweptCommit } from './todo-churn.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

// Conventional-commit types, in the order a reader wants them: what changed behaviorally, then what
// was restructured, then the supporting work.
const TYPE_ORDER = ['feat', 'fix', 'perf', 'refactor', 'test', 'docs', 'build', 'chore'];

function getReviewDate(cell) {
  const path = join(here, cell, 'review.md');
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8').match(/^updated:\s*'?(\d{4}-\d{2}-\d{2})'?/m)?.[1] ?? null;
}

// Subjects of commits that did real work on this package, sweeps excluded on the same rule the
// liveness ranking uses. A draft listing "add repository field to all packages" as this cell's work
// hands the compressing agent noise to summarize, and it is not work on the cell at all.
function readCommits(cell, since) {
  let out;
  try {
    out = execFileSync('git', ['log', `--since=${since}`, '--no-renames', '--numstat', '--format=C%s', '--', 'packages'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }

  const subjects = [];
  let subject = null;
  let pending = new Map();
  const flush = () => {
    if (subject === null) return;
    const mine = pending.get(cell);
    if (mine !== undefined && !isSweptCommit(pending.size, mine)) subjects.push(subject);
    pending = new Map();
  };
  for (const line of out.split('\n')) {
    if (line.startsWith('C')) {
      flush();
      subject = line.slice(1);
      continue;
    }
    const match = line.match(/^(\d+)\t(\d+)\tpackages\/([^/]+)\//);
    if (match) pending.set(match[3], (pending.get(match[3]) ?? 0) + Number(match[1]) + Number(match[2]));
  }
  flush();
  return subjects;
}

// Groups subjects by conventional-commit type, dropping the `type(scope):` prefix from the text so
// the draft reads as a list of changes rather than a list of commits.
function groupByType(subjects) {
  const groups = new Map();
  for (const subject of subjects) {
    const match = subject.match(/^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/);
    const type = match ? match[1] : 'other';
    const text = match ? match[2] : subject;
    const bucket = groups.get(type) ?? [];
    if (!bucket.includes(text)) bucket.push(text);
    groups.set(type, bucket);
  }
  return [...groups].sort((a, b) => {
    const ai = TYPE_ORDER.indexOf(a[0]);
    const bi = TYPE_ORDER.indexOf(b[0]);
    return (ai === -1 ? TYPE_ORDER.length : ai) - (bi === -1 ? TYPE_ORDER.length : bi);
  });
}

const args = process.argv.slice(2);
const sinceFlag = args.find((a) => a.startsWith('--since='))?.slice('--since='.length);
const cells = args.filter((a) => !a.startsWith('--'));

if (cells.length === 0) {
  console.error('usage: node agents/packages/status-draft.mjs <cell> [<cell>...] [--since=YYYY-MM-DD]');
  process.exit(1);
}

for (const cell of cells) {
  const since = sinceFlag ?? getReviewDate(cell);
  if (since === null) {
    console.error(`${cell}: no review.md date and no --since given; skipping`);
    continue;
  }
  const subjects = readCommits(cell, since);
  console.log(`\n${'='.repeat(78)}\n${cell} — draft entry, ${subjects.length} commits since ${since}\n${'='.repeat(78)}`);
  if (subjects.length === 0) {
    console.log('\n_No commits since the review; the existing survey still stands._');
    continue;
  }
  console.log(`\n## <date> — <headline the agent writes>\n`);
  console.log(`Derived from ${subjects.length} commits landed since the ${since} review. Compress into prose;`);
  console.log(`keep what a future agent needs (half-done threads, gotchas, why), drop the rest.\n`);
  for (const [type, texts] of groupByType(subjects)) {
    console.log(`**${type}**`);
    for (const text of texts) console.log(`- ${text}`);
    console.log('');
  }
}
