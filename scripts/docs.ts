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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import pc from 'picocolors';

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

export function getDocBudgetStatus(length: number, limit: number): DocBudgetStatus {
  if (length > limit) return 'over';
  return length >= limit - limit * DOC_BUDGET_WARN_FRACTION ? 'near' : 'ok';
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

function checkCells(): void {
  const cells = readdirSync(CELLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

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

// Gates rather than warns. The baseline is zero, so any hit is a regression introduced by one edit and
// is cheap to fix at that moment; as a warning it would join 146 others that already need a human
// ruling, and be read as background noise.
function checkMapStatus(): void {
  for (const budget of DOC_BUDGETS) {
    const path = join(REPO_ROOT, budget.path);
    if (!existsSync(path)) continue;
    for (const claim of findMapStatusClaims(readFileSync(path, 'utf8'))) {
      fail(
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

function fail(message: string): void {
  failures.push(message);
}

function main(): void {
  reportBudgets();
  checkLinks();
  checkMapStatus();
  checkCells();
  reportWarnings();

  if (failures.length > 0) {
    process.stderr.write(`\n${pc.red('✗')} ${pc.bold(`${failures.length} documentation contract violations`)}\n`);
    for (const failure of failures) process.stderr.write(`  ${pc.red('✗')} ${failure}\n`);
    process.exit(1);
  }

  process.stdout.write(`${pc.green('✓')} Agent docs valid (cell envelopes conform, links resolve)\n`);
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

const CELL_FILES = ['charter.md', 'review.md', 'assessment.md', 'status.md'] as const;
const CHARTER_SECTIONS = ['What it is', 'North star', 'Boundaries', 'Decisions', 'Open directions'] as const;
const REVIEW_STATUSES = ['stub', 'partial', 'solid', 'authoritative'] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const failures: string[] = [];
const warnings: string[] = [];

// Guarded so the colocated test can import the exported budget API without running the gate as a side
// effect of the import.
if (process.argv.includes('--check')) main();
