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
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import pc from 'picocolors';

import { getNewestStatusEntryDate } from '../agents/packages/todo-status-date.mjs';

// Every doc with a self-declared size budget. Keep the number here identical to the one the doc states
// in its own prose — the doc is where a reader meets the rule, this table is only what enforces it.
export const DOC_BUDGETS: readonly DocBudget[] = [{ limit: 40_000, path: 'AGENTS.md' }];

// Fraction of the limit below which the budget warns rather than passes silently. 2% of 40,000 is 800
// characters — roughly a long paragraph, so the warning lands while one section can still absorb the
// cut, instead of when every section would have to.
export const DOC_BUDGET_WARN_FRACTION = 0.02;

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

// Which docs nothing links to, after the named allowances. Kept pure and separate from the walking so
// the rule can be stated in a test rather than inferred from a filesystem crawl.
export function findOrphanDocs(
  docs: readonly string[],
  linked: ReadonlySet<string>,
  tracked?: ReadonlySet<string>,
): readonly string[] {
  return docs.filter(
    (doc) =>
      (tracked === undefined || tracked.has(doc)) &&
      !linked.has(doc) &&
      !ORPHAN_ALLOW.some((entry) => entry.match(doc)),
  );
}

/**
 * The files git tracks. A docs gate must judge THE REPOSITORY, not whatever happens to sit on the disk
 * of whoever ran it — and generated output is the difference between the two. `agents/reviews/` is
 * gitignored, so a clone that has run that generator carries ~179 unreferenced documents the repository
 * deliberately does not keep, and a clone that has not carries zero. Same commit, opposite verdicts.
 *
 * That is worse than a flake: it FAILS LOCALLY AND PASSES IN CI, because CI starts from a clean
 * checkout. The pipeline looks healthy while a developer is told to go fix 179 files the project already
 * decided not to track — pressure to delete exactly the wrong thing to go green.
 *
 * Tracked-ness is a fact rather than an opinion, so this needs no allow-list and cannot rot as the
 * generated set changes.
 */
function listTrackedFiles(): ReadonlySet<string> | undefined {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const tracked = new Set(output.split('\0').filter((entry) => entry !== ''));
    return tracked.size === 0 ? undefined : tracked;
  } catch {
    return undefined;
  }
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

function checkAssessment(cell: string, dir: string): void {
  const path = join(dir, 'assessment.md');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
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
      warn(`agents/packages/${cell}/assessment.md: Approved entry lacks a '[YYYY-MM-DD · provenance]' stamp`);
      continue;
    }
    const provenance = stamp[2].trim();
    if (!/^picked$|^blanket "/.test(provenance)) {
      warn(
        `agents/packages/${cell}/assessment.md: Approved provenance '${provenance}' is outside CONTRACT.md's vocabulary (picked | blanket "…")`,
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
function checkCellCoverage(cells: ReadonlySet<string>, tracked: ReadonlySet<string> | undefined): void {
  const onDisk = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const packages = tracked === undefined ? onDisk : onDisk.filter((name) => hasTrackedFile(tracked, name));

  for (const name of findUncoveredPackages(packages, cells)) {
    fail(`packages/${name}/: no agents/packages/${name}/ cell — run \`node agents/packages/scaffold.mjs\``);
  }
}

// Built packages with no cell, in the order given. The reverse direction is deliberately not reported:
// a cell with no package is a chartered-unbuilt, absorbed, external, or reserved cell, all of which are
// legitimate and already classified by the generated index.
export function findUncoveredPackages(packages: readonly string[], cells: ReadonlySet<string>): readonly string[] {
  return packages.filter((name) => !cells.has(name));
}

// Whether git tracks anything under `packages/<name>`, which is what makes it a package rather than a
// directory. A removed package leaves an untracked empty residue behind on the disk of whoever had it
// checked out — `packages/sprite` is exactly that today, tracking zero paths after the responsibility
// split. Reading the disk would demand a cell for a package the repository no longer contains, and
// would do it only for those developers: red locally, green in CI, which is the failure mode the
// orphan check above already documents. Tracked-ness is the same fact there and here.
export function hasTrackedFile(tracked: ReadonlySet<string>, name: string): boolean {
  const prefix = `packages/${name}/`;
  for (const file of tracked) {
    if (file.startsWith(prefix)) return true;
  }
  return false;
}

function checkCells(): void {
  const cells = readdirSync(CELLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  checkCellCoverage(new Set(cells), listTrackedFiles());

  for (const cell of cells) {
    const dir = join(CELLS_DIR, cell);
    const charterPath = join(dir, 'charter.md');

    if (!existsSync(charterPath)) {
      fail(`agents/packages/${cell}/: charter.md is required and missing`);
      continue;
    }

    for (const entry of readdirSync(dir)) {
      if (!(CELL_FILES as readonly string[]).includes(entry)) {
        warn(`agents/packages/${cell}/${entry}: not a contract file (${CELL_FILES.join(', ')})`);
      }
    }

    const charterText = readFileSync(charterPath, 'utf8');
    const charter = parseFrontMatter(charterText);
    const isDraft = charter.draft === 'true';
    // An absorbed / reserved / rust-intended / spun-out cell is architectural history or an upstream
    // naming record, not a live charter — the body-section contract does not apply to it.
    const isHistorical =
      charter.absorbed !== undefined ||
      charter.reserved !== undefined ||
      charter.rust !== undefined ||
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
    checkReview(cell, dir);
    checkStatus(cell, dir);
    checkAssessment(cell, dir);
  }
}

function checkLinks(): void {
  for (const file of walkMarkdown(join(REPO_ROOT, 'agents'))) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0].trim();
      if (target === '' || /^(https?:|mailto:)/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) {
        fail(`${relative(REPO_ROOT, file)}: broken link → ${target}`);
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
function checkMapStatus(): void {
  for (const budget of DOC_BUDGETS) {
    const path = join(REPO_ROOT, budget.path);
    if (!existsSync(path)) continue;
    for (const claim of findMapStatusClaims(readFileSync(path, 'utf8'))) {
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
function checkOrphans(): void {
  // Prose documents only — deliberately NOT `scripts/`, and that exclusion is load-bearing rather than
  // incidental. This checker's own tests build fixtures out of REAL document names (`rig-model.md`,
  // `seam-audit.md`), because each one records an actual incident. Widen this corpus to source files and
  // every one of those fixtures becomes a phantom pointer that marks a genuinely unreachable document as
  // reached — the gate would then go quiet in exactly the case it exists to catch, and quiet is
  // indistinguishable from clean. Verified by probing the running gate, not by reading it: a link planted
  // inside `scripts/docs.test.ts` is still reported orphaned.
  const corpus = [join(REPO_ROOT, 'AGENTS.md'), ...walkMarkdown(join(REPO_ROOT, 'agents'))];
  if (existsSync(SKILLS_DIR)) corpus.push(...walkMarkdown(SKILLS_DIR));

  const tracked = listTrackedFiles();
  // Untracked generated output is filtered from the POINTER SOURCES too, not just from the docs being
  // judged. A generated document that links to a tracked one would otherwise mark it reached on the
  // clone that ran the generator and leave it reported on the clone that did not — the same
  // per-machine divergence, arriving as a false pass rather than a false failure.
  const linked = findReachableDocs(
    corpus
      .map((file) => ({ path: relative(REPO_ROOT, file), text: readFileSync(file, 'utf8') }))
      .filter((source) => tracked === undefined || tracked.has(source.path)),
  );

  const docs = walkMarkdown(join(REPO_ROOT, 'agents')).map((file) => relative(REPO_ROOT, file));
  for (const orphan of findOrphanDocs(docs, linked, tracked)) {
    fail(
      `${orphan}: reachable from no authority-bearing document — the codebase map, a cell charter, an index, the catalog or the package map must point at it, or no reader arrives`,
    );
  }

  process.stdout.write(
    `${pc.dim(
      tracked === undefined
        ? '  orphan-check could NOT determine which files git tracks, so it scanned the working tree — generated output on disk may be reported'
        : `  orphan-check scope: the ${tracked.size} files git tracks — generated output on disk is deliberately not judged, so this gate reads the repository rather than the machine`,
    )}\n`,
  );
  process.stdout.write(
    `${pc.dim('  orphan-check counts pointers only from the map, cell charters, indexes, the catalog and the package map — a pointer from a status log does not count, because status is the append-only continuity layer and explicitly not blessed truth')}\n`,
  );

  // Printed every run, not only when one is used: an allowance whose reason is invisible is
  // indistinguishable from an oversight, and the next careful reader deletes it.
  for (const entry of ORPHAN_ALLOW) process.stdout.write(`${pc.dim(`  orphan-check allowance: ${entry.why}`)}\n`);
}

function checkReview(cell: string, dir: string): void {
  const path = join(dir, 'review.md');
  if (!existsSync(path)) return;
  const meta = parseFrontMatter(readFileSync(path, 'utf8'));
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
function checkStatus(cell: string, dir: string): void {
  const path = join(dir, 'status.md');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
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
  reportBudgets();
  checkLinks();
  checkOrphans();
  checkMapStatus();
  checkCells();
  reportWarnings();

  if (failures.length > 0) {
    process.stderr.write(`\n${pc.red('✗')} ${pc.bold(`${failures.length} documentation contract violations`)}\n`);
    for (const failure of failures) process.stderr.write(`  ${pc.red('✗')} ${failure}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `${pc.green('✓')} Agent docs valid (cell envelopes conform, links resolve, every doc reachable)\n`,
  );
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

// Terminates at the next `## ` heading, a `---` horizontal rule, or true end-of-string. The
// end-of-string form must be `$(?![\s\S])` — under the `m` flag a bare `$` matches every line end, so
// the lazy quantifier stops at the first newline and the capture comes back empty. That exact bug
// silently zeroed the Open-directions term of every bless-queue attention score.
function readSection(text: string, heading: string): string | null {
  const pattern = new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |^---\\s*$|$(?![\\s\\S]))`, 'm');
  const match = text.match(pattern);
  return match === null ? null : match[1];
}

function reportBudgets(): void {
  for (const budget of DOC_BUDGETS) {
    const report = reportDocBudget(budget, readFileSync(join(REPO_ROOT, budget.path), 'utf8'));
    const headroom = report.limit - report.length;
    const measured = `${report.length.toLocaleString('en-US')} / ${report.limit.toLocaleString('en-US')} characters`;
    if (report.status === 'over') {
      fail(
        `${report.path} is ${(-headroom).toLocaleString('en-US')} characters OVER budget (${measured}) — move the elaboration into the agents/ doc that owns it and leave a pointer`,
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

function walkMarkdown(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walkMarkdown(full));
    else if (entry.endsWith('.md')) found.push(full);
  }
  return found;
}

function warn(message: string): void {
  warnings.push(message);
}

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CELLS_DIR = join(REPO_ROOT, 'agents', 'packages');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');

const SKILLS_DIR = join(REPO_ROOT, '.claude', 'skills');

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

const CELL_FILES = ['charter.md', 'review.md', 'assessment.md', 'status.md'] as const;
const CHARTER_SECTIONS = ['What it is', 'North star', 'Boundaries', 'Decisions', 'Open directions'] as const;
const REVIEW_STATUSES = ['stub', 'partial', 'solid', 'authoritative'] as const;
// A cell's architectural position, per CONTRACT.md. `header`/`barrel` absorb other packages' work by
// design and rank on owned commits; `tooling`/`host` sit outside the SDK barrel and rank separately.
const CHARTER_ROLES = new Set(['barrel', 'header', 'host', 'package', 'tooling']);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const failures: string[] = [];
const warnings: string[] = [];

// Guarded so the colocated test can import the exported budget API without running the gate as a side
// effect of the import.
if (process.argv.includes('--check')) main();
