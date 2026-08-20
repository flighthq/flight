// The agent-documentation gate. Two surfaces, one script.
//
// The first is the size budget an agent-facing doc declares about itself. AGENTS.md is read IN FULL at
// the start of every agent session, so every character in it is paid for by every session whether or
// not the task touches that domain. That is why it carries a stated budget and a stated remedy: when a
// section grows past a trigger plus the rule it enforces, the elaboration moves into the domain doc
// under agents/ that owns it and a pointer stays behind.
//
// The budget was written down long before anything enforced it, and the file drifted over it anyway —
// discovered by accident during unrelated work, at which point nobody could say when it had crossed.
// A doc budget nobody measures is a suggestion; this makes it a gate. The warn band exists so the
// pressure arrives while there is still room to move a section deliberately, rather than as a red gate
// on top of whatever change happened to be the last one in.
//
// Measured in CHARACTERS, not bytes or tokens: it is the unit the budget is written in, and it is
// stable across encodings. There is no fix mode, because the remedy is an editorial decision about
// which section has outgrown the map, not a mechanical rewrite.
//
// The second surface is the per-package cell envelope from agents/packages/CONTRACT.md — file
// presence, front matter, and the ledger stamps — plus every relative link between agent docs. A
// dangling pointer in a review document is worse than no pointer: an agent follows it, finds nothing,
// and silently proceeds without the rule. CONTRACT.md names this checker as the thing enforcing it.
//
// Two severities, deliberately. FAILURES are unambiguous violations a machine can be sure about.
// WARNINGS are drift needing a human ruling — a charter missing its North star cannot be fixed by an
// agent, because charter direction comes from the user alone. Gating on those would paint `npm run
// check` red with work no agent is allowed to do.
//
// ONE SCANNING POLICY, GATE-WIDE: every check resolves its file set from `listGateFiles`, never from a
// directory walk of its own. See that function for why, and for the two ways disk and repository
// diverge. A new check that reaches for `readdirSync` reintroduces a defect this file has already had
// twice.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import pc from 'picocolors';

import { readPackageLastCommitDates } from '../agents/packages/todo-churn.mjs';
import { getNewestStatusEntryDate } from '../agents/packages/todo-status-date.mjs';
import { auditDocumentedCommands, formatDocumentedCommandAuditSummary } from './check-documented-commands';
import { readSection } from './markdownSection';
import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';

// Every doc with a self-declared size budget. Keep the number here identical to the one the doc states
// in its own prose — the doc is where a reader meets the rule, this table is only what enforces it.
// A budget only binds if the budgeted doc cannot spawn an unbudgeted companion to hold its overflow.
// `evidence-discipline.md` was gated at 12,000 characters and paired with an explicitly exempt
// instances file — "instances accumulate, laws do not" — which reached 81,000 characters in one day.
// The budget never constrained the writing; it relocated it. Both files were deleted 2026-08-08 and
// their grounded findings moved to the artifacts they describe. Do not add an exempt companion here.
export const DOC_BUDGETS: readonly DocBudget[] = [{ limit: 40_000, path: 'AGENTS.md' }];

// Fraction of the limit below which the budget warns rather than passes silently. 2% of 40,000 is 800
// characters — roughly a long paragraph, so the warning lands while one section can still absorb the
// cut, instead of when every section would have to.
export const DOC_BUDGET_WARN_FRACTION = 0.02;

// The size a `status.md` should hold: an `Open` section plus a log of dated one-liners. It is not in
// DOC_BUDGETS and does not gate, because the two failures it names are the ones a gate handles worst.
//
// A status log goes over by ACCRETING SESSION NARRATION — a commit message restated as prose, which
// git already carries with the diff attached — and it goes stale because that narration is prepended
// while the `Open` section underneath is never revisited. Both are judgement calls about prose, so the
// remedy is a person rewriting the file, and a red gate cannot make that happen any faster.
//
// So this REPORTS, in aggregate, and the aggregate is the point: at the time the rule was written 90 of
// 147 logs were over the cap and 112 of 144 were behind their own package's last commit. Ninety
// individual warnings is a wall nobody reads — the same noise-blindness that let the drift accumulate —
// so the report is a count plus the worst few, and the list shortens as cells are rewritten.
export const STATUS_LOG_CAP = 6_000;

// How many of the worst offenders to name per axis. Enough to give a reader somewhere to start,
// short enough that the summary line stays the thing being read.
export const STATUS_LOG_REPORT_LIMIT = 3;

// Words that report how far along a piece of work is. AGENTS.md is read in full by every agent on
// every task, so a pointer entry carrying progress becomes a second source of truth beside the linked
// doc's own status header — and the copy goes stale silently, then gets trusted. This has already
// happened: the map claimed the texture model had "only M2 implemented" while the doc said M2–M5 had
// landed. `unratified` is deliberately absent, and is the blessed way to say a design is not settled:
// it changes what an agent may DO rather than reporting progress, so it does not rot.
export const MAP_STATUS_WORDS =
  /\b(?:awaiting|completed|deferred|implemented|in[-\s]flight|in[-\s]progress|incomplete|landed|not yet|partially|partly|proposals?|proposed|shipped|so far|to date|unimplemented|wip)\b|\d{4}-\d{2}-\d{2}/gi;

export interface DocBudget {
  limit: number;
  path: string;
}

export interface MapStatusClaim {
  entry: string;
  words: readonly string[];
}

export interface DocBudgetReport {
  length: number;
  limit: number;
  path: string;
  status: DocBudgetStatus;
}

// `over` fails the gate; `near` warns and passes; `ok` is silent.
export type DocBudgetStatus = 'near' | 'ok' | 'over';

// The file set every scan resolves against, and where it came from. `source` is carried rather than
// inferred so the gate can say which one it used — a fallback that does not announce itself is how a
// per-machine verdict passes for a repository-wide one.
export interface GateFileSet {
  files: ReadonlySet<string>;
  source: 'disk' | 'git';
  // Directories the disk walk could not read. Always empty in `git` mode, which queries no directory.
  // Carried for the same reason `source` is: a scan that silently covered less than it claims is the
  // failure this file keeps rediscovering, and an unreadable directory is exactly that — a hole in the
  // file set. Reported, never thrown; see `listWorkingTreeFiles`.
  unreadable: readonly string[];
}

// One cell's status log, measured against the two things that make it untrue: its own size, and the
// package it describes. `codeDate` is null for a cell with no `packages/<name>/` — absorbed, reserved,
// downstream, spun out — and `statusDate` is null for a log with no dated entry yet.
export interface StatusLogEntry {
  cell: string;
  codeDate: string | null;
  length: number;
  statusDate: string | null;
}

// Scans only the link-led pointer entries (`- [name](path) — trigger`) under Domain Conventions, which
// is where every historical violation sat. Deliberately not the whole file: the surrounding rules are
// allowed to say "implemented" or "partially built" because they state a standard rather than report
// progress — a file-wide scan flags the AAA-completeness rule and the transient-notes rule, and a check
// that cries wolf on its own doctrine gets muted. Entry prose is scanned with code spans and link
// targets removed, so a path or a fenced literal never trips it.
export function findMapStatusClaims(mapText: string): readonly MapStatusClaim[] {
  const section = readSection(mapText, 'Domain Conventions');
  if (section === null) return [];

  const claims: MapStatusClaim[] = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('- [')) continue;
    const prose = line.replaceAll(/`[^`]*`/g, '').replaceAll(/\]\([^)]*\)/g, ']');
    const words = [...prose.matchAll(MAP_STATUS_WORDS)].map((match) => match[0]);
    if (words.length > 0) claims.push({ entry: line.slice(3).split(']')[0], words });
  }
  return claims;
}

// A cell charter registers its extra docs as front-matter keys (`rigModel: ./rig-model.md`), the way
// `swf/charter.md` already carries `tagCoverage` and `fixtureEvidence`. That is a real pointer from an
// authority-bearing file, so it counts — a gate that recognised only markdown links would turn red on
// the established fix and push people toward the weaker one.
export function findFrontMatterPointerTargets(text: string): readonly string[] {
  const front = text.match(/^---\n([\s\S]*?)\n---/);
  if (front === null) return [];
  return [...front[1].matchAll(/^[\w-]+:\s*(\.\/[^\s'"]+\.md)\s*$/gm)].map((match) => match[1]);
}

// Link targets only — a name in prose or a code span is deliberately NOT a link. This is the whole
// distinction the orphan gate turns on, and it is not pedantry: `seam-audit.md` was named in four
// documents, in backticks, and was still reachable by nobody, because a reader cannot navigate a
// mention. Anchors and external schemes are dropped so `doc.md#section` and a URL never masquerade as
// a local target.
export function findMarkdownLinkTargets(text: string): readonly string[] {
  const targets: string[] = [];
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].trim();
    if (target === '' || /^(https?:|mailto:)/.test(target)) continue;
    targets.push(target);
  }
  return targets;
}

// The immediate child DIRECTORIES of a directory, named by the files under them. A directory exists to
// this gate exactly when the repository has a file in it, which is what makes an emptied rename husk
// (`packages/scene/`, left behind by the scene2d rename) invisible without an allow-list naming it.
export function findGateDirectories(files: ReadonlySet<string>, dir: string): readonly string[] {
  const prefix = dir === '' ? '' : `${dir}${sep}`;
  const names = new Set<string>();
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length).split(sep);
    if (rest.length > 1) names.add(rest[0]);
  }
  return [...names].sort();
}

// The file names directly inside a directory, excluding anything nested deeper.
export function findGateEntries(files: ReadonlySet<string>, dir: string): readonly string[] {
  const prefix = dir === '' ? '' : `${dir}${sep}`;
  const names: string[] = [];
  for (const file of files) {
    if (!file.startsWith(prefix)) continue;
    const rest = file.slice(prefix.length);
    if (!rest.includes(sep)) names.push(rest);
  }
  return names.sort();
}

// Every markdown file at or below a directory, repo-relative. The replacement for the recursive disk
// walk this file used to carry — same shape of answer, drawn from the repository instead of the disk.
export function findGateMarkdown(files: ReadonlySet<string>, dir: string): readonly string[] {
  const prefix = `${dir}${sep}`;
  return [...files].filter((file) => file.startsWith(prefix) && file.endsWith('.md')).sort();
}

// Which docs nothing links to, after the named allowances. Kept pure and separate from the walking so
// the rule can be stated in a test rather than inferred from a filesystem crawl. It takes no scope
// argument: the scope decision belongs to the gate's file set, not to this one check — pinning it here
// is what let the sibling check twelve lines away keep scanning the disk.
export function findOrphanDocs(docs: readonly string[], linked: ReadonlySet<string>): readonly string[] {
  return docs.filter((doc) => !linked.has(doc) && !ORPHAN_ALLOW.some((entry) => entry.match(doc)));
}

// Status logs past the working-note cap, largest first. Pure over plain records so the rule is pinned
// by a table in a test rather than by a checkout with the right sizes in it.
export function findOverlongStatusLogs(entries: readonly StatusLogEntry[], limit: number): readonly StatusLogEntry[] {
  return entries.filter((entry) => entry.length > limit).sort((a, b) => b.length - a.length);
}

// Whether a path names something the repository has — a file, or a directory with any file under it.
// Both forms are legitimate link targets (`agents/` and `agents/commands.md` are each linked from the
// map), so a link checker has to accept either without asking the disk.
export function hasGatePath(files: ReadonlySet<string>, path: string): boolean {
  if (files.has(path)) return true;
  const prefix = `${path}${sep}`;
  for (const file of files) {
    if (file.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * THE ONE FILE SET EVERY SCAN IN THIS GATE RESOLVES AGAINST.
 *
 * A docs gate must judge THE REPOSITORY, not whatever happens to sit on the disk of whoever ran it. The
 * two diverge in two ways, and both have already produced a wrong verdict here:
 *
 * - GENERATED OUTPUT. `agents/reviews/` is gitignored, so a clone that has run that generator carries
 *   ~179 unreferenced documents the repository deliberately does not keep, and a clone that has not
 *   carries zero.
 * - RENAME RESIDUE. `packages/scene`, `packages/surface`, and the four `packages/displayobject-…` are
 *   emptied husks of directories renamed long ago. Four clones produced four missing-cell counts — 8, 2, 11,
 *   and zero — and NONE of the four was wrong, so two agents comparing numbers could not reconcile
 *   them and argued about the count instead of about the gate.
 *
 * The zero is the dangerous one. CI starts from a clean checkout, so a check keyed to residue is GREEN
 * IN THE ONLY ENVIRONMENT THAT GATES ANYTHING and red only for developers carrying it — the inverse of
 * a flake, the version nobody debugs, except it blocks.
 *
 * So the rule is the GATE'S, not one check's: every scan resolves its file set from here. Fixing the
 * one check that happened to fail is why this came back in a sibling check twelve lines from the fix.
 * Membership comes from git; CONTENT still comes from the working tree, because a gate that read
 * committed content could never see the edit it is being run on.
 *
 * The cost is stated rather than hidden: a brand-new uncommitted doc is not judged until it is added.
 * That is the right trade against a per-clone verdict, and it is now the same trade everywhere rather
 * than one check making it alone.
 */
function listGateFiles(): GateFileSet {
  const tracked = listTrackedFiles();
  if (tracked !== undefined) return { files: tracked, source: 'git', unreadable: [] };
  const walked = listWorkingTreeFiles();
  return { files: walked.files, source: 'disk', unreadable: walked.unreadable };
}

// Tracked-ness is a fact rather than an opinion, so this needs no allow-list and cannot rot as the
// generated set changes. Git reports `/`-separated paths; they are converted to the platform separator
// so one spelling of a path is used everywhere in this file.
function listTrackedFiles(): ReadonlySet<string> | undefined {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const tracked = new Set(
      output
        .split('\0')
        .filter((entry) => entry !== '')
        .map((entry) => entry.split('/').join(sep)),
    );
    return tracked.size === 0 ? undefined : tracked;
  } catch {
    return undefined;
  }
}

// The last resort when git cannot be queried — a checkout with no `.git`, or no git on PATH. It yields
// the same SHAPE of answer as `listTrackedFiles` so no check needs a second code path: there is one
// file set, and only its provenance differs. The gate says which it used on every run, because a
// silent fallback turns "this machine" into "the repository" without anyone noticing.
//
// AN UNREADABLE DIRECTORY IS AN ANSWER, NOT A CRASH. `readdirSync` throws on a directory the runner
// cannot open, and letting that escape replaced the gate's verdict with a raw stack trace — a gate that
// cannot report is the same class of defect as a gate that reports the wrong thing. The directory is
// recorded and the walk continues, so the run still reaches a verdict AND still says what it could not
// see. Skipping quietly would be the worse half of both: a smaller file set presented as a whole one.
function listWorkingTreeFiles(): { files: ReadonlySet<string>; unreadable: readonly string[] } {
  const found = new Set<string>();
  const unreadable: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      unreadable.push(relative(REPO_ROOT, dir) || '.');
      return;
    }
    for (const entry of entries) {
      if (SCAN_SKIP_DIRECTORIES.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else found.add(relative(REPO_ROOT, full));
    }
  };
  walk(REPO_ROOT);
  return { files: found, unreadable: unreadable.sort() };
}

// Which docs are reached along a path a reader would actually travel. Pure, and taking its sources as
// values rather than reading the filesystem, so the authority rule can be pinned by a MINIMAL PAIR in
// the test file — the same document, the same content, the same single pointer, differing only in
// whether the pointing file bears authority. That pairing is the whole specification: a rule fixed by
// one positive example teaches whatever incidental feature happens to separate it from the failures,
// and the discriminator nobody wrote down is the one that later behaves wrongly.
//
// Paths are repo-relative on both sides, so a target resolves by joining it to its source's directory —
// `..` included. No repo root is needed, which is precisely what makes it testable.
export function findReachableDocs(sources: readonly Readonly<{ path: string; text: string }>[]): ReadonlySet<string> {
  const reached = new Set<string>();
  for (const source of sources) {
    if (!isAuthorityBearingDoc(source.path)) continue;
    for (const target of [...findMarkdownLinkTargets(source.text), ...findFrontMatterPointerTargets(source.text)]) {
      reached.add(join(dirname(source.path), target));
    }
  }
  return reached;
}

// Status logs whose newest entry predates their own package's last commit, widest gap first. A cell
// with no local code is skipped rather than reported: `codeDate` is null there, and "the status log is
// behind code that does not exist here" is not a finding.
//
// Dates are YYYY-MM-DD, so lexical comparison is date comparison. Equal dates are current — a log
// written the same day as a commit is treated as having seen it, matching `sumChurnSince`.
export function findStaleStatusLogs(entries: readonly StatusLogEntry[]): readonly StatusLogEntry[] {
  return entries
    .filter((entry) => entry.codeDate !== null && entry.statusDate !== null && entry.statusDate < entry.codeDate)
    .sort((a, b) => (a.statusDate ?? '').localeCompare(b.statusDate ?? ''));
}

// Cell membership is stricter than general reachability. An index can make an evidence document
// reachable to a reader without the cell ever claiming it; that exact shape passed the orphan check
// for `scene2d-dom/public-lane-audit.md`. The comparison stays mechanical: exact cell path, exact four
// contract paths, and pointer targets resolved from that cell's charter alone. It deliberately does
// not change `isAuthorityBearingDoc` or rank one document against another.
export function findUnacknowledgedCellDocs(
  cellDir: string,
  entries: readonly string[],
  charterText: string,
): readonly string[] {
  const charterPath = join(cellDir, 'charter.md');
  const acknowledged = findReachableDocs([{ path: charterPath, text: charterText }]);

  return entries
    .filter((entry) => entry.endsWith('.md') && !(CELL_FILES as readonly string[]).includes(entry))
    .map((entry) => join(cellDir, entry))
    .filter((doc) => !acknowledged.has(doc));
}

export function getDocBudgetStatus(length: number, limit: number): DocBudgetStatus {
  if (length > limit) return 'over';
  return length >= limit - limit * DOC_BUDGET_WARN_FRACTION ? 'near' : 'ok';
}

// Which files count as a path a reader actually arrives along. Reachability is NOT binary, and this is
// the reason: a doc can be pointed at and still be unreachable for its purpose if the only pointer sits
// in a file that disclaims its own authority. `status.md` is the continuity layer — append-only,
// explicitly transient, and consulted for dangling threads rather than for truth — so four durable
// architectural rules reachable only from a status log are, in practice, findable by nobody.
//
// The set is ENUMERATED, never assessed. A gate must not rank how authoritative a document feels; that
// is a judgement, and judgement in a gate becomes a habit. Membership is a filename test, so the check
// stays mechanical and a reader can predict its answer without running it.
export function isAuthorityBearingDoc(rel: string): boolean {
  const name = basename(rel);
  return (
    rel === 'AGENTS.md' ||
    name === 'charter.md' ||
    name === 'index.md' ||
    rel === join('agents', 'packages', 'catalog.md') ||
    rel === join('agents', 'packages', 'map.md')
  );
}

export function reportDocBudget(budget: Readonly<DocBudget>, contents: string): DocBudgetReport {
  const length = contents.length;
  return { length, limit: budget.limit, path: budget.path, status: getDocBudgetStatus(length, budget.limit) };
}

function checkAssessment(files: ReadonlySet<string>, cell: string, dir: string): void {
  const text = readGateFile(files, join(dir, 'assessment.md'));
  if (text === null) return;
  const meta = parseFrontMatter(text);

  if (meta.basedOn === undefined) {
    fail(`agents/packages/${cell}/assessment.md: missing required front-matter key 'basedOn'`);
  }
  if (meta.updated !== undefined && meta.updated !== 'null' && !DATE.test(meta.updated)) {
    fail(`agents/packages/${cell}/assessment.md: updated '${meta.updated}' is not YYYY-MM-DD`);
  }

  const approved = readSection(text, 'Approved');
  if (approved === null) return;
  for (const line of approved.split('\n')) {
    if (!/^\s*-\s+\S/.test(line)) continue;
    const stamp = line.match(/^\s*-\s*\*{0,2}\[(\d{4}-\d{2}-\d{2})\s*·\s*([^\]]+)\]/);
    if (stamp === null) {
      // Not a failure: Approved is an append-only ledger, so repairing the stamp in place is itself a
      // contract violation, and only the approver knows which provenance the entry should carry.
      warn(
        `agents/packages/${cell}/assessment.md: Approved entry lacks a '[YYYY-MM-DD · provenance]' stamp${LAWFUL_REMEDY}`,
      );
      continue;
    }
    const provenance = stamp[2].trim();
    if (!/^picked$|^blanket "/.test(provenance)) {
      warn(
        `agents/packages/${cell}/assessment.md: Approved provenance '${provenance}' is outside CONTRACT.md's vocabulary (picked | blanket "…")${LAWFUL_REMEDY}`,
      );
    }
  }
}

// Every built package must have a cell, because the cell is where review content lands. Checked from
// the `packages/` side: the per-cell checks below iterate cells, so a package with no cell directory at
// all is not a violation to them — it is simply never visited. That blind spot let `importdiagnostics`,
// `quadbatch`, and `tilemap` sit uncovered for weeks; they surfaced only when someone happened to run
// `scaffold.mjs`, which nothing schedules. A missing charter is the one unambiguous, mechanically
// fixable envelope violation here (CONTRACT.md: "charter.md is required"), so it fails. A missing
// review/assessment does not: those are stage outputs, and "this stage has not run yet" is what the
// generated liveness list is for, not a gate.
function checkCellCoverage(files: ReadonlySet<string>, cells: ReadonlySet<string>): void {
  for (const name of findUncoveredPackages(findGateDirectories(files, PACKAGES_DIR), cells)) {
    fail(`packages/${name}/: no agents/packages/${name}/ cell — run \`node agents/packages/scaffold.mjs\``);
  }
}

// Built packages with no cell, in the order given. The reverse direction is deliberately not reported:
// a cell with no package is a chartered-unbuilt, absorbed, external, or reserved cell, all of which are
// legitimate and already classified by the generated index.
export function findUncoveredPackages(packages: readonly string[], cells: ReadonlySet<string>): readonly string[] {
  return packages.filter((name) => !cells.has(name));
}

function checkCells(files: ReadonlySet<string>): void {
  const cells = findGateDirectories(files, CELLS_DIR);

  checkCellCoverage(files, new Set(cells));

  for (const cell of cells) {
    const dir = join(CELLS_DIR, cell);
    const charterText = readGateFile(files, join(dir, 'charter.md'));

    if (charterText === null) {
      fail(`agents/packages/${cell}/: charter.md is required and missing`);
      continue;
    }

    for (const doc of findUnacknowledgedCellDocs(dir, findGateEntries(files, dir), charterText)) {
      fail(
        `${doc}: supplementary cell document is not acknowledged by ${dir}/charter.md — add a resolvable Markdown link or front-matter ./…md pointer there`,
      );
    }

    for (const entry of findGateEntries(files, dir)) {
      if (!(CELL_FILES as readonly string[]).includes(entry)) {
        warn(`agents/packages/${cell}/${entry}: not a contract file (${CELL_FILES.join(', ')})`);
      }
    }

    const charter = parseFrontMatter(charterText);
    const isDraft = charter.draft === 'true';
    // An absorbed / reserved / downstream / spun-out cell is architectural history or an upstream
    // naming record, not a live charter — the body-section contract does not apply to it.
    const isHistorical =
      charter.absorbed !== undefined ||
      charter.reserved !== undefined ||
      charter.downstream !== undefined ||
      charter.spunOut !== undefined;

    if (charter.package === undefined) {
      fail(`agents/packages/${cell}/charter.md: missing required front-matter key 'package'`);
    } else if (charter.package !== `@flighthq/${cell}`) {
      fail(
        `agents/packages/${cell}/charter.md: package is '${charter.package}', must equal '@flighthq/${cell}' (CONTRACT.md § Front matter)`,
      );
    }

    if (charter.lastDirection !== undefined && charter.lastDirection !== 'null' && !DATE.test(charter.lastDirection)) {
      fail(`agents/packages/${cell}/charter.md: lastDirection '${charter.lastDirection}' is not YYYY-MM-DD`);
    }

    // `role` drives how generators rank staleness, so an unknown value silently degrades a cell to
    // the default rather than erroring at the generator — fail here, where the typo is visible.
    if (charter.role !== undefined && !CHARTER_ROLES.has(charter.role)) {
      fail(
        `agents/packages/${cell}/charter.md: role '${charter.role}' is outside CONTRACT.md's vocabulary (${[...CHARTER_ROLES].join(' | ')})`,
      );
    }

    // The naming families the roles describe are mechanical, so a mismatch is a mis-stamp rather than
    // a judgement call. Warned, not failed: a future family may legitimately want a different role.
    const expectedRole = cell.startsWith('tool-') ? 'tooling' : cell.startsWith('host-') ? 'host' : null;
    if (expectedRole !== null && (charter.role ?? 'package') !== expectedRole) {
      warn(
        `agents/packages/${cell}/charter.md: role '${charter.role ?? 'package'}' but the name implies '${expectedRole}'`,
      );
    }

    // The contract says crate is `flighthq-<name>`. Several cells deliberately diverge to record an
    // intended rename ahead of the Rust port (bitmap → flighthq-surface, the scene3d family →
    // flighthq-scene-*). No Cargo.toml exists in this repo yet, so the divergence costs nothing today
    // — but it is drift between the contract and the corpus, and one of the two should move.
    if (charter.crate !== undefined && charter.crate !== 'null' && charter.crate !== `flighthq-${cell}`) {
      warn(`agents/packages/${cell}/charter.md: crate '${charter.crate}' diverges from 'flighthq-${cell}'`);
    }

    if (!isHistorical) {
      for (const section of CHARTER_SECTIONS) {
        if (readSection(charterText, section) === null) {
          const note = isDraft ? ' (draft)' : '';
          warn(`agents/packages/${cell}/charter.md${note}: missing '## ${section}'`);
        }
      }
    }

    checkOrdinals(cell, charterText);
    checkReview(files, cell, dir);
    checkStatus(files, cell, dir);
    checkAssessment(files, cell, dir);
  }
}

// Pointer → target. A target is resolved against the repository rather than the disk for the same
// reason everything else here is: a link satisfied only by untracked residue resolves on the machine
// that has it and dangles for everyone else, which is the failure mode inverted — a false PASS.
function checkLinks(files: ReadonlySet<string>): void {
  for (const file of findGateMarkdown(files, AGENTS_DIR)) {
    const text = readGateFile(files, file);
    if (text === null) continue;
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0].trim();
      if (target === '' || /^(https?:|mailto:)/.test(target)) continue;
      if (!hasGatePath(files, join(dirname(file), target))) {
        fail(`${file}: broken link → ${target}`);
      }
    }
  }
}

// Warns rather than gates, which is a deliberate reversal. Gating looked right in isolation — the
// baseline is zero, so any hit is a one-edit regression. But 20 of the 30 commits in history that add a
// pointer entry would have failed it, and `docs:check` feeds `quality`, so at that rate the gate would
// itself have become a recurring reason CI is red and commits stop promoting. A one-word style rule must
// not stop the line. Moving it earlier does not help either: a pre-commit hook blocks the commit
// instead. So it reports, and a reviewer rules on what it finds.
function checkMapStatus(files: ReadonlySet<string>): void {
  for (const budget of DOC_BUDGETS) {
    const text = readGateFile(files, budget.path);
    if (text === null) continue;
    for (const claim of findMapStatusClaims(text)) {
      warn(
        `${budget.path}: pointer entry '${claim.entry}' reports progress (${claim.words.join(', ')}) — ` +
          `status belongs in the linked doc's own header, not in the map every agent reads in full`,
      );
    }
  }
}

// A numbered section that repeats an ordinal reads as two items with the same number, and cross-
// references elsewhere ("Open direction 5") then point at both. Cheap to detect, easy to miss by eye.
function checkOrdinals(cell: string, charterText: string): void {
  for (const section of ['Open directions', 'Decisions'] as const) {
    const body = readSection(charterText, section);
    if (body === null) continue;
    const seen = new Set<number>();
    for (const match of body.matchAll(/^(\d+)\.\s/gm)) {
      const ordinal = Number(match[1]);
      if (seen.has(ordinal)) {
        fail(`agents/packages/${cell}/charter.md: '${section}' uses ordinal ${ordinal} more than once`);
        break;
      }
      seen.add(ordinal);
    }
  }
}

// The inverse of `checkLinks`, and the reason both have to exist: DEAD LINK AND ORPHAN ARE THE TWO
// HALVES OF THE SAME INVARIANT, AND ONLY ONE HALF WAS GATED. `checkLinks` walks pointer → target and
// fails when a pointer leads nowhere. Nothing walked target → pointer, so a doc that *nothing* links to
// was invisible to every check in this file. That asymmetry is precisely how the codebase map could be
// trimmed twice, correctly, for its character budget while two unrelated docs sat unreachable the whole
// time — one of them a spec whose own header called it blessed, building, and superseding an earlier
// note. A true record nobody can reach is worse than no record at all: the agent it is meant to direct
// reaches the map, the catalog and the cell, never arrives, and builds the superseded model while the
// spec sits on disk saying the opposite.
//
// Reachability means an actual resolvable markdown link, not a prose mention. You cannot navigate a
// mention, and the whole point of the invariant is that a reader *arrives*.
function checkOrphans(files: ReadonlySet<string>): void {
  // Prose documents only — deliberately NOT `scripts/`, and that exclusion is load-bearing rather than
  // incidental. This checker's own tests build fixtures out of REAL document names (`rig-model.md`,
  // `seam-audit.md`), because each one records an actual incident. Widen this corpus to source files and
  // every one of those fixtures becomes a phantom pointer that marks a genuinely unreachable document as
  // reached — the gate would then go quiet in exactly the case it exists to catch, and quiet is
  // indistinguishable from clean. Verified by probing the running gate, not by reading it: a link planted
  // inside `scripts/docs.test.ts` is still reported orphaned.
  //
  // Untracked output is out of the POINTER SOURCES as well as out of the docs being judged, and that
  // falls out of drawing both from the gate's file set. A generated document that links to a tracked one
  // would otherwise mark it reached on the clone that ran the generator and leave it reported on the
  // clone that did not — the same per-machine divergence, arriving as a false pass.
  const docs = findGateMarkdown(files, AGENTS_DIR);
  const corpus = ['AGENTS.md', ...docs, ...findGateMarkdown(files, SKILLS_DIR)];

  const linked = findReachableDocs(
    corpus
      .map((path) => ({ path, text: readGateFile(files, path) }))
      .filter((source): source is { path: string; text: string } => source.text !== null),
  );

  for (const orphan of findOrphanDocs(docs, linked)) {
    fail(
      `${orphan}: reachable from no authority-bearing document — the codebase map, a cell charter, an index, the catalog or the package map must point at it, or no reader arrives`,
    );
  }

  process.stdout.write(
    `${pc.dim('  orphan-check counts pointers only from the map, cell charters, indexes, the catalog and the package map — a pointer from a status log does not count, because a status log is working state that disclaims its own authority, and its Open section is rewritten in place rather than ratified')}\n`,
  );

  // Printed every run, not only when one is used: an allowance whose reason is invisible is
  // indistinguishable from an oversight, and the next careful reader deletes it.
  for (const entry of ORPHAN_ALLOW) process.stdout.write(`${pc.dim(`  orphan-check allowance: ${entry.why}`)}\n`);
}

function checkReview(files: ReadonlySet<string>, cell: string, dir: string): void {
  const text = readGateFile(files, join(dir, 'review.md'));
  if (text === null) return;
  const meta = parseFrontMatter(text);
  if (meta.status !== undefined && !(REVIEW_STATUSES as readonly string[]).includes(meta.status)) {
    fail(`agents/packages/${cell}/review.md: status '${meta.status}' is not one of ${REVIEW_STATUSES.join(' | ')}`);
  }
  if (meta.updated !== undefined && meta.updated !== 'null' && !DATE.test(meta.updated)) {
    fail(`agents/packages/${cell}/review.md: updated '${meta.updated}' is not YYYY-MM-DD`);
  }
}

// status.md was the one contract file with no envelope check, and it drifted accordingly: 48 of 116
// cells carried an `updated:` older than their own newest entry, while the validated charter/review/
// assessment dates stayed clean. CONTRACT.md defines the field as "date of the newest entry", so the
// dated headings are the truth and the field is a cache of them.
//
// The drift warns rather than gates. todo.mjs now derives the status date (max of field and headings)
// instead of trusting the field, so a stale one no longer corrupts the re-review list — it is
// cosmetic, and a cosmetic mismatch across 48 cells must not turn `npm run check` red.
function checkStatus(files: ReadonlySet<string>, cell: string, dir: string): void {
  const text = readGateFile(files, join(dir, 'status.md'));
  if (text === null) return;
  const meta = parseFrontMatter(text);

  const declared = meta.updated !== undefined && meta.updated !== 'null' ? meta.updated : null;
  if (declared !== null && !DATE.test(declared)) {
    fail(`agents/packages/${cell}/status.md: updated '${declared}' is not YYYY-MM-DD`);
    return;
  }

  // Shared with todo.mjs so the warning and the derivation can never disagree about what an entry is.
  const newest = getNewestStatusEntryDate(text);
  if (newest === null) return;

  if (declared === null) {
    warn(`agents/packages/${cell}/status.md: missing 'updated' — newest entry is ${newest}`);
  } else if (newest > declared) {
    warn(`agents/packages/${cell}/status.md: updated '${declared}' is behind its newest entry ${newest}`);
  }
}

function fail(message: string): void {
  failures.push(message);
}

function main(): void {
  const { files, source, unreadable } = listGateFiles();
  reportGateScope(files, source, unreadable);
  reportBudgets(files);
  checkDocumentedCommands(files);
  checkLinks(files);
  checkOrphans(files);
  checkMapStatus(files);
  checkCells(files);
  reportStatusLogs(files);
  reportWarnings();

  if (failures.length > 0) {
    process.stderr.write(`\n${pc.red('✗')} ${pc.bold(`${failures.length} documentation contract violations`)}\n`);
    for (const failure of failures) process.stderr.write(`  ${pc.red('✗')} ${failure}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `${pc.green('✓')} Agent docs valid (cell envelopes conform, supplementary docs are charter-acknowledged, links resolve, every doc reachable)\n`,
  );
}

// A command citation is a documentation contract just as much as a relative link. This deliberately
// consumes the gate's one file set: the standalone audit remains available, but docs:check is the gate.
function checkDocumentedCommands(files: ReadonlySet<string>): void {
  const markdown = [...files].filter((file) => file.endsWith('.md')).sort();
  const audit = auditDocumentedCommands(REPO_ROOT, markdown);
  process.stdout.write(`${formatDocumentedCommandAuditSummary(audit)}\n`);
  const missing = audit.byVerdict.get('missing')!;
  if (missing.length === 0 && audit.unreadableDocs.length === 0) {
    process.stdout.write(`${pc.green('✓')} Every documented npm command resolves against the root manifest\n`);
    return;
  }
  for (const citation of missing) {
    fail(`${citation.docPath}:${citation.docLine}: npm run ${citation.command} names no root script`);
  }
  for (const docPath of audit.unreadableDocs) fail(`${docPath}: tracked markdown could not be read for command audit`);
}

// Membership from the gate's file set, CONTENT from the working tree — the split the whole scanning
// policy rests on. A file the repository tracks but the working tree no longer has is an uncommitted
// deletion, and reporting it missing is the honest answer rather than a crash.
// Largest top-level (`## `) section by character count, so an over-budget report can name the block
// worth moving instead of leaving the reader to pick one. Returns null when the document has no
// top-level sections to move.
function findLargestDocSection(text: string): Readonly<{ heading: string; length: number }> | null {
  let largest: { heading: string; length: number } | null = null;
  let heading: string | null = null;
  let length = 0;
  const close = (): void => {
    if (heading !== null && (largest === null || length > largest.length)) {
      largest = { heading, length };
    }
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      close();
      heading = line.slice(3).trim();
      length = 0;
    }
    length += line.length + 1;
  }
  close();
  return largest;
}

function readGateFile(files: ReadonlySet<string>, path: string): string | null {
  if (!files.has(path)) return null;
  const full = join(REPO_ROOT, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function parseFrontMatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (match === null) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    if (pair !== null) result[pair[1]] = pair[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return result;
}

function reportBudgets(files: ReadonlySet<string>): void {
  for (const budget of DOC_BUDGETS) {
    const text = readGateFile(files, budget.path);
    if (text === null) {
      fail(`${budget.path}: declared a size budget but the repository does not have it`);
      continue;
    }
    const report = reportDocBudget(budget, text);
    const headroom = report.limit - report.length;
    const measured = `${report.length.toLocaleString('en-US')} / ${report.limit.toLocaleString('en-US')} characters`;
    if (report.status === 'over') {
      // The magnitude suggests its own remedy — "486 over" reads as "cut 486 characters" — and a
      // generic pointer to the structural fix loses to it every time. Naming the specific section to
      // move, and saying outright that trimming will not clear the overrun, is what makes the
      // structural response the available one.
      const largest = findLargestDocSection(text);
      const move =
        largest === null
          ? 'move a whole section into the agents/ doc that owns it and leave a pointer'
          : `move a whole section into the agents/ doc that owns it and leave a pointer — the largest is "${largest.heading}" at ${largest.length.toLocaleString('en-US')} characters`;
      fail(
        `${report.path} is ${(-headroom).toLocaleString('en-US')} characters OVER budget (${measured}) — ${move}. Trimming wording is not the remedy.`,
      );
      continue;
    }
    if (report.status === 'near') {
      process.stdout.write(
        `${pc.yellow('!')} ${report.path} is within ${headroom.toLocaleString('en-US')} characters of its budget (${measured})\n`,
      );
      continue;
    }
    process.stdout.write(`${pc.green('✓')} ${report.path} ${measured}\n`);
  }
}

// The two status-log drifts, as one aggregate line each. See STATUS_LOG_CAP for why this reports in
// aggregate instead of warning per cell.
//
// The cell list comes from the gate file set like every other check, but `codeDate` comes from git,
// which is the whole point: the status log is what somebody remembered to write, and the commit date
// is what actually happened. Comparing the log against itself — the existing `checkStatus` drift —
// only ever catches a stale front-matter field. Comparing it against git catches a stale FILE.
function reportStatusLogs(files: ReadonlySet<string>): void {
  const codeDates = readPackageLastCommitDates(REPO_ROOT);
  const entries: StatusLogEntry[] = [];

  for (const cell of findGateDirectories(files, CELLS_DIR)) {
    const text = readGateFile(files, join(CELLS_DIR, cell, 'status.md'));
    if (text === null) continue;
    entries.push({
      cell,
      codeDate: codeDates.get(cell) ?? null,
      length: text.length,
      // The derived date, not the declared field: `checkStatus` already reports when the two disagree,
      // and taking the field here would make a cell with a stale header look stale twice for one cause.
      statusDate: getNewestStatusEntryDate(text),
    });
  }
  if (entries.length === 0) return;

  // No git, no comparison. Saying so beats printing "0 behind", which reads as a clean result.
  if (codeDates.size === 0) {
    process.stdout.write(`${pc.dim('  status logs: package commit dates unavailable — staleness not measured')}\n`);
  }

  const overlong = findOverlongStatusLogs(entries, STATUS_LOG_CAP);
  const stale = findStaleStatusLogs(entries);
  if (overlong.length === 0 && stale.length === 0) return;

  const name = (entry: StatusLogEntry): string => entry.cell;
  if (overlong.length > 0) {
    const worst = overlong.slice(0, STATUS_LOG_REPORT_LIMIT);
    const sizes = worst.map((entry) => `${name(entry)} ${entry.length.toLocaleString('en-US')}`).join(' · ');
    process.stdout.write(
      `${pc.yellow('!')} ${overlong.length} of ${entries.length} status logs over the ${STATUS_LOG_CAP.toLocaleString('en-US')}-character working-note cap — largest: ${sizes}\n`,
    );
  }
  if (stale.length > 0) {
    const worst = stale.slice(0, STATUS_LOG_REPORT_LIMIT);
    const gaps = worst.map((entry) => `${name(entry)} (log ${entry.statusDate}, code ${entry.codeDate})`).join(' · ');
    process.stdout.write(
      `${pc.yellow('!')} ${stale.length} status logs behind their package's last commit — stalest: ${gaps}\n`,
    );
  }
  process.stdout.write(
    `${pc.dim('  a status log is an Open section plus dated one-liners; session narration belongs in git. See agents/packages/CONTRACT.md.')}\n`,
  );
}

// Printed once, at the top, because it is a property of the GATE rather than of any one check — and
// because a scope nobody states is a scope nobody can compare. Four clones reported four different
// missing-cell counts and spent the reconciliation arguing about the numbers; this line is what would
// have ended that in one message.
function reportGateScope(
  files: ReadonlySet<string>,
  source: GateFileSet['source'],
  unreadable: readonly string[],
): void {
  process.stdout.write(
    `${pc.dim(
      source === 'git'
        ? `  docs gate scope: the ${files.size} files git tracks. Every scan here resolves its file set from git, so untracked generated output and emptied rename husks on disk are not judged and the verdict is identical in every clone.`
        : '  docs gate could NOT query git, so every scan fell back to the working tree — untracked generated output and rename residue MAY be reported, and this verdict is about this machine rather than about the repository',
    )}\n`,
  );

  // Named individually rather than counted: a hole in the file set is only actionable if you know
  // where it is, and there is never a long list of these — one unreadable directory is already unusual.
  if (unreadable.length === 0) return;
  process.stdout.write(
    `${pc.yellow('!')} ${pc.bold(`${unreadable.length} director${unreadable.length === 1 ? 'y' : 'ies'} could not be read`)}, so the walked file set is incomplete and every scan below judged less than the whole tree:\n`,
  );
  for (const directory of unreadable) process.stdout.write(`  ! ${directory}\n`);
}

// Warnings are grouped by shape rather than listed one per line: 30-odd charters missing the same
// section is one finding about the corpus, not 30 findings.
function reportWarnings(): void {
  if (warnings.length === 0) return;
  const grouped = new Map<string, number>();
  for (const warning of warnings) {
    // Group by the shape of the message: drop the cell path and collapse the leading quoted value
    // (the section name, crate, provenance). Only the first quoted run is collapsed — collapsing every
    // one also eats the quoted literals that are part of the rule text itself.
    const key = warning.replace(/^agents\/packages\/[^/]+\//, '').replace(/'[^']*'/, "'…'");
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  process.stdout.write(
    `\n${pc.yellow('!')} ${pc.bold(`${warnings.length} documentation warnings`)} (not gating — these need a human ruling)\n`,
  );
  for (const [key, count] of [...grouped].sort((a, b) => b[1] - a[1])) {
    process.stdout.write(`  ${pc.yellow('!')} ${String(count).padStart(3)} × ${key}\n`);
  }
  if (process.argv.includes('--verbose')) {
    process.stdout.write('\n');
    for (const warning of warnings) process.stdout.write(`      ${warning}\n`);
  } else {
    process.stdout.write(`  ${pc.dim('run with --verbose to list each one')}\n`);
  }
}

function warn(message: string): void {
  warnings.push(message);
}

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

// Repo-relative, because that is the spelling the gate's file set uses. An absolute directory here
// would be an invitation to walk it, which is the thing this file no longer does.
const AGENTS_DIR = 'agents';
const CELLS_DIR = join('agents', 'packages');
const PACKAGES_DIR = 'packages';
const SKILLS_DIR = join('.claude', 'skills');

// Only reached in the no-git fallback. `.git` and `node_modules` are excluded because walking them is
// pure cost; `dist` because it is build output no scan here is about.
// This gate skips exactly the shared set and adds nothing of its own. In particular it must NOT skip
// `.claude`: `SKILLS_DIR` lives under it, so the skills half of the orphan corpus is resolved from this
// same walk. `order.ts` and `mocks.ts` do skip `.claude`, which is why that entry sits at their call
// sites rather than in the shared set.
//
// The set previously held only `.git`, `dist` and `node_modules` — three of the nine — so the disk
// fallback descended into `.cache`, where a fetched fixture corpus is 26,461 files. Nothing was ever
// REPORTED from there, but only because `checkOrphans` scopes its corpus to `agents/` and `.claude/
// skills/`: LUCK OF SCOPING, NOT A GUARD. Widening that scope without this line would have surfaced
// every markdown file in a downloaded corpus as an orphaned document.

// A doc can be legitimately unlinked, and the gate has to let the honest answer through — an allowance
// with no recorded reason looks exactly like an oversight, and the next careful reader deletes it. Each
// entry says why the doc is reachable by something other than a link, and the reason is printed on every
// run so it stays a visible decision rather than a silent skip.
const ORPHAN_ALLOW: { match: (rel: string) => boolean; why: string }[] = [
  {
    match: (rel) => (CELL_FILES as readonly string[]).includes(basename(rel)),
    why: 'cell contract files (charter/review/assessment/status) are reached by directory enumeration in checkCells, not by pointer — every cell is visited by construction',
  },
  {
    match: (rel) => rel === join('agents', 'packages', 'TODO.md'),
    why: 'generated work index (todo.mjs), deliberately never committed — it is a view over the cells, so nothing links to it as a document',
  },
];

// Every warning about an Approved line carries this, because A REPORTED LINE APPLIES PRESSURE TO EDIT
// THE THING BEING REPORTED and editing is the fastest way to make it go quiet — which is precisely the
// violation. Both of these warnings are UNFIXABLE in place: the ledger is append-only, so the only
// lawful remedy is a new superseding line. Naming it converts an invitation-to-violate into an
// instruction. `check:append-only-ledgers` fails anyone who tries the quiet route anyway.
const LAWFUL_REMEDY =
  ' — Approved is append-only, so do NOT edit this line: the only lawful remedy is a NEW dated line that supersedes it, left for the approver to write';

const CELL_FILES = ['charter.md', 'review.md', 'assessment.md', 'status.md'] as const;
const CHARTER_SECTIONS = ['What it is', 'North star', 'Boundaries', 'Decisions', 'Open directions'] as const;
const REVIEW_STATUSES = ['stub', 'partial', 'solid', 'authoritative'] as const;
// A cell's architectural position, per CONTRACT.md. `header`/`barrel` absorb other packages' work by
// design and rank on owned commits; `tooling`/`host` sit outside the SDK barrel and rank separately.
const CHARTER_ROLES = new Set(['barrel', 'header', 'host', 'package', 'tooling']);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const failures: string[] = [];
const warnings: string[] = [];

// Guarded so an importer gets the exported API without running the gate as a side effect. Keyed to
// THIS FILE BEING THE ENTRY POINT rather than to a `--check` flag anywhere in argv: the ledger check
// imports `readSection` from here, and a flag test would have fired the whole gate inside any process
// that happened to carry that word.
if (resolve(process.argv[1] ?? '') === resolve(dirname(new URL(import.meta.url).pathname), 'docs.ts')) main();
