// The append-only ledger check. CONTRACT.md names two sections — `charter.md › Decisions` and
// `assessment.md › Approved` — as append-only: existing lines are never edited or deleted, only added.
// A reversed decision is a NEW dated line that supersedes the old one; the old line stays.
//
// That invariant was enforced by convention and by nobody editing them. It was not merely an unbacked
// claim in prose, though — it was already shaping the tooling: `docs.ts` deliberately WARNS rather than
// fails on an Approved entry missing its provenance stamp, and says why in the code — repairing the
// stamp in place would itself be a contract violation. An invariant that constrains what a gate is
// willing to demand, while being enforced by nothing, is the thing to make real.
//
// THE CHECK IS SET-PRESERVATION, NOT A DIFF READING. Every non-blank line present in a guarded section
// at the merge-base must still be present in that same section, byte-identical. Additions are free.
// That formulation is order-independent and needs no content schema — which is the property CONTRACT.md
// was reaching for — and it catches the case a `HEAD~1` comparison misses, where a branch edits a line
// in one commit and edits it again in the next so no single step looks wrong.
//
// Comparison is by MULTISET rather than by set: a section holding the same line twice and losing one
// copy has lost a line. Blank lines are excluded, so reflowing the whitespace around a ledger is not a
// violation.
//
// WHOLE-CELL REMOVAL IS NOT A LINE DELETION. Deleting a package takes its cell with it, and every
// guarded line "disappears" — reporting that as an append-only violation would make removing a package
// impossible. It is reported as a removal instead: counted, named, and never a failure. Deleting the
// LEDGER FILE while the cell remains is the opposite case and does fail, because that is exactly how a
// ledger would be laundered.
//
// WHERE IT RUNS, AND THE TWO CONDITIONS THAT ONCE DEFEATED IT. This check first shipped enforcing
// nothing in CI, in two independent ways, and both are named here because a gate is only trustworthy
// once the conditions that defeat it are written down and shown defeated.
//
// 1. DOCS-ONLY COMMIT. It was reachable only through `npm run check` in the `quality` job, which is
//    gated on `code == 'true'`, and the `code` filter excludes `**/*.md`. Its guarded sections ARE .md
//    files, so a commit editing only a ledger — the exact commit it exists to police — did not run it
//    at all. It now runs in the `docs` job, keyed to the `docs` filter, which is what its subject
//    matches. That REMOVES the cross-file coupling rather than annotating it.
// 2. SHALLOW CLONE. A depth-1 checkout has no second integration ref, so no merge-base resolves and
//    the run correctly reports that it compared nothing. The `docs` job carries `fetch-depth: 0`.
//
// The `quality` job's copy, via `npm run check`, carries `fetch-depth: 0` too, so it is a real run
// rather than a redundant self-report. `docs` remains the one keyed to this check's own subject: any
// commit touching a ledger sets `docs == 'true'`, so the run that matters always happens even when
// `code` is false. Locally `npm run check` is the real one.
//
// 3. INTEGRATED HEAD. `selectLedgerBaseline` used to return no baseline as soon as any remote
//    candidate contained HEAD, without falling through to one that is behind. On a PUSH build the
//    checked-out branch IS that candidate, so the run compared nothing AT ANY FETCH DEPTH — proven
//    with a pair of clones off a source whose develop tip carried a tampered Approved line: depth-1
//    and full-history both exited 0 saying so. A containing candidate is now skipped rather than
//    terminal, so the push build resolves the next-nearest baseline and runs for real. Work reaches
//    develop by push here, not only by PR, so this was the event carrying most of our work.
//
// A PASS YOU DID NOT FIRST PROVE COULD FAIL IS NOT EVIDENCE. The colocated tests pin the rules; the
// end-to-end proof is a ledger-only commit editing one existing Approved line, which must exit 1 with
// history present and is the input this check must never be trusted without failing on.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

import { readSection } from './markdownSection';

export interface LedgerBaseCandidate {
  distance: number;
  name: string;
  revision: string;
}

export interface LedgerDocument {
  path: string;
  text: string;
}

export interface LedgerSection {
  cell: string;
  file: string;
  heading: string;
  lines: readonly string[];
}

export interface LedgerRemoval {
  cell: string;
  file: string;
  heading: string;
  lines: number;
}

export interface LedgerViolation {
  cell: string;
  detail: string;
  file: string;
  heading: string;
  line: string | null;
}

export interface AppendOnlyLedgerReport {
  baselineLines: number;
  comparedSections: number;
  removals: LedgerRemoval[];
  violations: LedgerViolation[];
}

// The two guarded sections, and only these two. `status.md › Log` is append-only by convention as well,
// but CONTRACT.md does not put it under the mechanical rule and this check does not invent scope. Its
// sibling `status.md › Open` is the deliberate opposite — a statement of current state, rewritten in
// place — so guarding that file wholesale would freeze the half that has to change to stay true.
export const GUARDED_LEDGERS: readonly Readonly<{ file: string; heading: string }>[] = [
  { file: 'assessment.md', heading: 'Approved' },
  { file: 'charter.md', heading: 'Decisions' },
];

/**
 * Every guarded line at the baseline that is no longer where it was.
 *
 * Pure, and taking both revisions as plain documents, so the rule can be pinned by a minimal pair in a
 * test rather than by constructing git history. `removedCells` names the cells that no longer exist at
 * all — the caller establishes that, because "the package was deleted" is a fact about the tree rather
 * than about these two files.
 */
export function checkAppendOnlyLedgers(
  baseline: readonly Readonly<LedgerSection>[],
  current: readonly Readonly<LedgerSection>[],
  removedCells: ReadonlySet<string>,
): AppendOnlyLedgerReport {
  const removals: LedgerRemoval[] = [];
  const violations: LedgerViolation[] = [];
  let baselineLines = 0;
  let comparedSections = 0;

  for (const section of baseline) {
    const ledgerLines = section.lines.filter((line) => line.trim() !== '');
    baselineLines += ledgerLines.length;

    if (removedCells.has(section.cell)) {
      removals.push({ cell: section.cell, file: section.file, heading: section.heading, lines: ledgerLines.length });
      continue;
    }

    const now = current.find((entry) => entry.cell === section.cell && entry.file === section.file);
    if (now === undefined) {
      // The cell is still here and the section is not. Every guarded line went with it, so this is
      // reported once rather than once per line — a hundred identical failures is one finding.
      violations.push({
        cell: section.cell,
        detail: `the '${section.heading}' ledger is gone but the cell remains — ${ledgerLines.length} approved line${ledgerLines.length === 1 ? '' : 's'} deleted; a ledger may only be removed with its whole cell`,
        file: section.file,
        heading: section.heading,
        line: null,
      });
      continue;
    }

    comparedSections++;
    const available = new Map<string, number>();
    for (const line of now.lines) {
      if (line.trim() === '') continue;
      available.set(line, (available.get(line) ?? 0) + 1);
    }

    for (const line of ledgerLines) {
      const remaining = available.get(line) ?? 0;
      if (remaining === 0) {
        violations.push({
          cell: section.cell,
          detail: 'edited or deleted; append-only — supersede it with a NEW dated line and leave this one standing',
          file: section.file,
          heading: section.heading,
          line,
        });
        continue;
      }
      available.set(line, remaining - 1);
    }
  }

  return { baselineLines, comparedSections, removals, violations };
}

// The guarded sections carried by a set of documents. Absent sections are simply absent: a cell with no
// `Decisions` heading yet has nothing to preserve, which is different from having lost it.
export function findLedgerSections(documents: readonly Readonly<LedgerDocument>[]): readonly LedgerSection[] {
  const sections: LedgerSection[] = [];
  for (const document of documents) {
    const cell = getLedgerCellName(document.path);
    if (cell === null) continue;
    for (const guarded of GUARDED_LEDGERS) {
      if (!document.path.endsWith(`${sep}${guarded.file}`) && !document.path.endsWith(`/${guarded.file}`)) continue;
      const body = readSection(document.text, guarded.heading);
      if (body === null) continue;
      sections.push({ cell, file: guarded.file, heading: guarded.heading, lines: body.split('\n') });
    }
  }
  return sections;
}

export function formatAppendOnlyLedgerReport(report: Readonly<AppendOnlyLedgerReport>, scope: string): string {
  const passed = report.violations.length === 0;
  const summary = `${report.baselineLines} guarded line${report.baselineLines === 1 ? '' : 's'} across ${report.comparedSections} section${report.comparedSections === 1 ? '' : 's'}`;
  const lines = [
    `${passed ? pc.green('OK') : pc.red('✗')} ${pc.bold('Append-only ledgers')} ${pc.dim(`(${summary})`)}`,
  ];
  lines.push(`  ${pc.dim(scope)}`);

  // Stated on every run, not only when one occurs. A removal is the one shape this check deliberately
  // does not fail on, and an exemption nobody can see is indistinguishable from a blind spot.
  for (const removal of report.removals) {
    lines.push(
      `  ${pc.dim(`removal (not a violation): ${removal.cell} no longer exists, so its ${removal.file} › ${removal.heading} went with it — ${removal.lines} line${removal.lines === 1 ? '' : 's'}`)}`,
    );
  }

  if (report.comparedSections === 0 && report.violations.length === 0) {
    lines.push(
      `  ${pc.yellow('!')} no guarded section was compared, so this run verified nothing — that is a property of the revision range, not a clean result`,
    );
  }

  if (!passed) {
    lines.push('', `  ${report.violations.length} append-only violation${report.violations.length === 1 ? '' : 's'}:`);
    for (const violation of report.violations) {
      const where = `agents/packages/${violation.cell}/${violation.file} › ${violation.heading}`;
      lines.push(violation.line === null ? `  - ${where}: ${violation.detail}` : `  - ${where}: ${violation.detail}`);
      if (violation.line !== null) lines.push(`      ${pc.dim(truncate(violation.line))}`);
    }
  }
  return lines.join('\n');
}

// The cell a ledger path belongs to. Anything outside `agents/packages/<cell>/` is not a cell file, and
// `agents/packages/CONTRACT.md` sits one level up — it is the contract, not a ledger.
/**
 * Which candidate revision the guarded sections are compared against, from their distances alone.
 *
 * Pure, and separated from the git calls, because this rule has been wrong THREE TIMES in three
 * different ways. A rule that keeps being wrong belongs where a minimal pair can pin every case, and
 * all three are pinned in the colocated test.
 *
 * THE CHECKED-OUT BRANCH IS NOT AN INTEGRATION REF. It contains HEAD by definition — the check runs on
 * the branch it is checking — so it carries no information and is dropped by name before anything else.
 * Treating it as evidence made the check report "already integrated" in every clone, everywhere, which
 * is inertness wearing a reason.
 *
 * A CANDIDATE THAT CONTAINS HEAD IS SKIPPED, NOT TERMINAL. Such a candidate is useless AS A BASELINE —
 * there is nothing between it and HEAD to compare — but "this candidate is useless" and "no candidate
 * is usable" are different conclusions, and returning the second on evidence for the first is what left
 * a PUSH build unguarded at any fetch depth: on a push to develop, `origin/develop` IS the checked-out
 * tip, so the one ref that contained HEAD ended the search while `origin/main` sat behind and would
 * have given a perfectly good baseline. Only when EVERY candidate contains HEAD is this tree integrated
 * with no work in flight.
 *
 * Falling through can open a WIDE window — 425 commits, on the push build this was fixed for. For an
 * append-only check that is CONSERVATIVE rather than dangerous: a wider window can only surface more
 * edited-or-deleted guarded lines, never fewer, and every line it flags is a real violation however far
 * back the baseline sits. Legitimate appends are free at any width, which is why the widest baseline in
 * this repo reports 1480 guarded lines across 278 sections and no violation.
 *
 * Otherwise THE NEAREST MERGE-BASE WINS, not the first candidate that resolved. The nearest common
 * ancestor is exactly the newest point HEAD is known to share with an integration branch, so the
 * commits after it are the work under review. Taking the first ref that resolved was the first version
 * of the same bug: in an agent clone `@{upstream}` is `origin/main`, hundreds of commits back.
 *
 * Measuring in commits rather than trusting a branch name means the answer does not depend on which
 * branch a clone happens to call canonical. The chosen ref and its commit count are always printed, so
 * a clone missing its nearest integration ref shows a large count rather than hiding one.
 */
export function selectLedgerBaseline(
  allCandidates: readonly Readonly<LedgerBaseCandidate>[],
  currentBranch: string | null,
): Readonly<{ how: string; revision: string | null }> {
  const candidates = allCandidates.filter((candidate) => candidate.name !== currentBranch);

  let best: Readonly<LedgerBaseCandidate> | null = null;
  for (const candidate of candidates) {
    if (candidate.distance === 0) continue;
    if (best === null || candidate.distance < best.distance) best = candidate;
  }
  if (best === null) {
    if (candidates.length > 0) {
      return {
        how: `every candidate contains HEAD (${candidates.map((candidate) => candidate.name).join(', ')}), so this tree is integrated and there is no work in flight — nothing was checked`,
        revision: null,
      };
    }
    return {
      how: 'no baseline revision could be resolved (detached head, missing remote, or shallow clone) — nothing was checked',
      revision: null,
    };
  }
  return {
    how: `baseline: merge-base with ${best.name} (${best.revision.slice(0, 9)}), ${best.distance} commit${best.distance === 1 ? '' : 's'} of work in flight`,
    revision: best.revision,
  };
}

export function getLedgerCellName(path: string): string | null {
  const parts = path.split(/[/\\]/);
  const index = parts.indexOf('packages');
  if (index < 1 || parts[index - 1] !== 'agents') return null;
  return parts.length === index + 3 ? parts[index + 1] : null;
}

// A failed probe is an ANSWER here, not an error: "this ref does not exist" is how the baseline is
// resolved. So git's stderr is discarded rather than inherited — an unconfigured upstream otherwise
// printed a bare `fatal: no upstream configured` into the middle of an ordinary run, which reads as a
// broken gate to everyone who did not write it.
function capture(args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The revision the guarded sections are compared against, and how it was found.
 *
 * THE NEAREST MERGE-BASE WINS, not the first candidate that resolves. A gate must judge THE WORK IN
 * FLIGHT — the commits not yet in anything integrated — and the nearest common ancestor is exactly the
 * newest point HEAD is known to share with an integration branch. Taking the first ref that happened to
 * resolve is how this went wrong on its first run: in an agent clone `@{upstream}` is `origin/main`,
 * which sits 361 commits back, so the "branch under review" became months of everyone's history and the
 * check reported seven real but long-landed edits at whoever ran it. A gate that can never go green and
 * blames the wrong author is not a gate. Those violations are real and are reported separately; they
 * are not this check's to raise on every run.
 *
 * Distance is measured in commits from the merge-base to HEAD, so the answer does not depend on which
 * branch a clone happens to call canonical — the tightest correct baseline wins on its own merit.
 *
 * It runs in agent clones with unusual ref layouts, on detached heads, and in shallow CI checkouts, so
 * EVERY failure to resolve returns null and the check reports that it did not run. A gate that throws
 * where a ref is missing is worse than one that skips: the throw stops the whole sweep for a reason
 * that has nothing to do with the invariant. Skipping is never silent — the scope line always says
 * which revision was used, or that none was and why.
 */
function resolveLedgerBase(): Readonly<{ how: string; revision: string | null }> {
  const explicit = process.env.FLIGHT_LEDGER_BASE?.trim();
  const names = explicit
    ? [explicit]
    : [
        capture(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
        'origin/develop',
        'origin/main',
        'develop',
        'main',
      ];

  const candidates: LedgerBaseCandidate[] = [];
  for (const name of names) {
    if (!name) continue;
    if (capture(['rev-parse', '--verify', '--quiet', `${name}^{commit}`]) === null) continue;
    const revision = capture(['merge-base', 'HEAD', name]);
    if (revision === null) continue;
    const distance = Number.parseInt(capture(['rev-list', '--count', `${revision}..HEAD`]) ?? '', 10);
    if (!Number.isFinite(distance)) continue;
    candidates.push({ distance, name, revision });
  }
  return selectLedgerBaseline(candidates, capture(['rev-parse', '--abbrev-ref', 'HEAD']));
}

function listLedgerDocumentsAt(revision: string): readonly LedgerDocument[] {
  const listed = capture(['ls-tree', '-r', '--name-only', revision, '--', 'agents/packages']);
  if (listed === null) return [];
  const documents: LedgerDocument[] = [];
  for (const path of listed.split('\n').filter((entry) => entry !== '')) {
    if (getLedgerCellName(path) === null) continue;
    if (!GUARDED_LEDGERS.some((guarded) => path.endsWith(`/${guarded.file}`))) continue;
    const text = capture(['show', `${revision}:${path}`]);
    if (text !== null) documents.push({ path, text });
  }
  return documents;
}

// The CURRENT side is the working tree, not HEAD. Membership of a ledger comes from the baseline
// revision; whether a line still stands is a question about the tree as it is now, and asking it of the
// working tree catches the edit before it is committed rather than after.
function readCurrentLedgerDocuments(baseline: readonly Readonly<LedgerSection>[]): readonly LedgerDocument[] {
  const documents: LedgerDocument[] = [];
  const seen = new Set<string>();
  for (const section of baseline) {
    const path = join('agents', 'packages', section.cell, section.file);
    if (seen.has(path)) continue;
    seen.add(path);
    const full = join(root, path);
    if (existsSync(full)) documents.push({ path, text: readFileSync(full, 'utf8') });
  }
  return documents;
}

// A cell is gone when nothing of it is left on disk. Checked from the cell's own required file rather
// than from a directory listing: CONTRACT.md makes `charter.md` mandatory, so a cell without one is not
// a cell, and an empty directory left behind by a delete does not keep a ledger alive.
function findRemovedCells(baseline: readonly Readonly<LedgerSection>[]): ReadonlySet<string> {
  const removed = new Set<string>();
  for (const section of baseline) {
    if (!existsSync(join(root, 'agents', 'packages', section.cell, 'charter.md'))) removed.add(section.cell);
  }
  return removed;
}

function main(): void {
  const { how, revision } = resolveLedgerBase();
  if (revision === null) {
    console.log(
      formatAppendOnlyLedgerReport({ baselineLines: 0, comparedSections: 0, removals: [], violations: [] }, how),
    );
    return;
  }

  const baseline = findLedgerSections(listLedgerDocumentsAt(revision));
  const current = findLedgerSections(readCurrentLedgerDocuments(baseline));
  const report = checkAppendOnlyLedgers(baseline, current, findRemovedCells(baseline));
  console.log(formatAppendOnlyLedgerReport(report, how));
  if (report.violations.length > 0) process.exitCode = 1;
}

function truncate(line: string): string {
  return line.length <= 160 ? line : `${line.slice(0, 157)}...`;
}

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), '..');

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
