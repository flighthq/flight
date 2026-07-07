// Generates TODO.md — the single grep-friendly index of actionable package work.
//
//   node agents/packages/todo.mjs
//
// Reads only the durable per-package cells (charter/review/assessment front matter and the
// assessment `Recommended` sections) plus register.md's hand-ranked Build queue. TODO.md is a
// generated view — never edit it by hand; edit the cells or the register and regenerate.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const codePackagesDir = join(repoRoot, 'packages');

function frontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function section(text, heading) {
  const pattern = new RegExp(`^## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm');
  const match = text.match(pattern);
  return match ? match[1].trim() : null;
}

// A Recommended item's one-line form: its bold headline if present, else its first sentence.
// Items are top-level numbered ("1. ") or dashed ("- ") list entries; indented sub-bullets are not items.
function itemHeadlines(recommendedSection) {
  const items = [];
  for (const line of recommendedSection.split('\n')) {
    const listItem = line.match(/^(?:\d+\.|-)\s+(.*)$/);
    if (!listItem) continue;
    const body = listItem[1];
    const bold = body.match(/^\*\*(.+?)\*\*/);
    let headline = bold ? bold[1] : (body.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? body);
    headline = headline.replace(/[.:]\s*$/, '').trim();
    if (headline.length > 140) headline = `${headline.slice(0, 137)}…`;
    items.push(headline);
  }
  return items;
}

function firstProseLine(text, heading) {
  const body = section(text, heading);
  if (!body) return null;
  const line = body.split('\n').find((l) => l.trim() && !l.startsWith('_') && !l.startsWith('>'));
  return line ? line.trim() : null;
}

const cells = readdirSync(here, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const chartered = [];
const deepen = [];
// Liveness: per-cell staleness signals so the review loop knows which stage each cell needs next.
const needsDirection = []; // charter is a stub or has never had a direction session
const needsReview = []; // built package, no review.md
const needsReReview = []; // status.md entry newer than the review — work landed since the survey
const needsAssess = []; // review newer than the assessment — findings not yet sorted
const openQuestions = []; // { name, count } of charter Open directions awaiting the user

for (const name of cells) {
  const cellDir = join(here, name);
  const charterPath = join(cellDir, 'charter.md');
  if (!existsSync(charterPath)) continue;

  const charter = readFileSync(charterPath, 'utf8');
  const charterMeta = frontMatter(charter);
  if (charter.includes('_TODO') || !charterMeta.lastDirection || charterMeta.lastDirection === 'null') {
    needsDirection.push(name);
  }
  const directions = section(charter, 'Open directions');
  if (directions) {
    const count = directions.split('\n').filter((l) => /^(?:\d+\.|-)\s/.test(l)).length;
    if (count > 0) openQuestions.push({ name, count });
  }

  if (!existsSync(join(codePackagesDir, name))) {
    const what = firstProseLine(charter, 'What it is') ?? '(charter stub)';
    chartered.push({ name, what });
    continue;
  }

  const reviewPath = join(cellDir, 'review.md');
  const review = existsSync(reviewPath) ? frontMatter(readFileSync(reviewPath, 'utf8')) : {};
  const score = review.score !== undefined ? Number(review.score) : null;
  const status = review.status ?? 'unreviewed';

  if (!existsSync(reviewPath)) needsReview.push(name);

  const statusPath = join(cellDir, 'status.md');
  const statusMeta = existsSync(statusPath) ? frontMatter(readFileSync(statusPath, 'utf8')) : {};
  // Dates are YYYY-MM-DD strings — lexical comparison is date comparison.
  if (review.updated && statusMeta.updated && statusMeta.updated !== 'null' && statusMeta.updated > review.updated) {
    needsReReview.push(`${name} (review ${review.updated} < status ${statusMeta.updated})`);
  }

  const assessmentPath = join(cellDir, 'assessment.md');
  let items = [];
  if (existsSync(assessmentPath)) {
    const assessmentText = readFileSync(assessmentPath, 'utf8');
    const assessmentMeta = frontMatter(assessmentText);
    if (review.updated && assessmentMeta.updated && assessmentMeta.updated < review.updated) {
      needsAssess.push(`${name} (assessment ${assessmentMeta.updated} < review ${review.updated})`);
    }
    const recommended = section(assessmentText, 'Recommended');
    if (recommended) items = itemHeadlines(recommended);
  }
  deepen.push({ name, status, score, items });
}

deepen.sort((a, b) => (a.score ?? 101) - (b.score ?? 101) || a.name.localeCompare(b.name));

const registerText = readFileSync(join(here, 'register.md'), 'utf8');
const buildQueue = section(registerText, 'Build queue') ?? '_No Build queue section found in register.md._';

const today = new Date().toISOString().slice(0, 10);
const lines = [];
lines.push('# Package TODO Index');
lines.push('');
lines.push(`_Generated ${today} by \`node agents/packages/todo.mjs\` — do not edit by hand. Sources: each cell's \`review.md\` (status/score), \`assessment.md › Recommended\` (the sweep-safe work queue), \`charter.md\` (chartered-unbuilt detection), and \`register.md › Build queue\`. Regenerate after assessments or the register change._`);
lines.push('');
lines.push('One line per actionable item. For detail, read only the named package\'s cell: `agents/packages/<name>/assessment.md` (and its `charter.md` for the rules). `Recommended` items are pre-sorted as sweep-safe but **not yet approved**; check `assessment.md › Approved` for blessed work.');
lines.push('');
lines.push('## Create — chartered, not yet built');
lines.push('');
lines.push('Blessed charters with no code behind them. Start from the charter; add a register + Package Map entry with the code.');
lines.push('');
for (const { name, what } of chartered) {
  lines.push(`- **\`${name}\`** — ${what}`);
}
lines.push('');
lines.push('## Create — ranked candidate queue (from register.md)');
lines.push('');
lines.push(buildQueue);
lines.push('');
lines.push('## Deepen — Recommended items by package (weakest first)');
lines.push('');
for (const { name, status, score, items } of deepen) {
  if (items.length === 0) continue;
  const scoreLabel = score === null ? status : `${status} ${score}`;
  lines.push(`### ${name} (${scoreLabel})`);
  lines.push('');
  for (const item of items) lines.push(`- ${item}`);
  lines.push('');
}
const noItems = deepen.filter((entry) => entry.items.length === 0).map((entry) => entry.name);
if (noItems.length > 0) {
  lines.push('## No open Recommended items');
  lines.push('');
  lines.push(noItems.map((name) => `\`${name}\``).join(' · '));
  lines.push('');
}

lines.push('## Liveness — which stage each stale cell needs next');
lines.push('');
lines.push('Computed from cell front matter (dates are `updated:`/`lastDirection:` fields). The review loop works this list to keep everything above trustworthy; workers can ignore it.');
lines.push('');
const liveness = [
  ['Needs a direction session (charter stub or never directed)', needsDirection.map((n) => `\`${n}\``)],
  ['Needs a first review (built, no review.md)', needsReview.map((n) => `\`${n}\``)],
  ['Needs re-review (work landed after the survey)', needsReReview.map((n) => `\`${n}\``)],
  ['Needs assess refresh (review newer than assessment)', needsAssess.map((n) => `\`${n}\``)],
];
for (const [label, entries] of liveness) {
  lines.push(`- **${label}:** ${entries.length > 0 ? entries.join(' · ') : '_none_'}`);
}
const questionTotal = openQuestions.reduce((sum, q) => sum + q.count, 0);
const heaviest = openQuestions
  .filter((q) => q.count >= 6)
  .sort((a, b) => b.count - a.count)
  .map((q) => `\`${q.name}\` (${q.count})`);
lines.push(
  `- **Open directions awaiting the user:** ${questionTotal} across ${openQuestions.length} charters — most-loaded: ${heaviest.join(' · ') || '_none_'}. Each charter's \`## Open directions\` section holds the questions; a direction session drains them.`,
);
lines.push('');

writeFileSync(join(here, 'TODO.md'), `${lines.join('\n')}`);
console.log(
  `TODO.md: ${chartered.length} chartered-unbuilt, ${deepen.filter((d) => d.items.length > 0).length} packages with Recommended items, ${noItems.length} with none; liveness: ${needsDirection.length} direction, ${needsReview.length} review, ${needsReReview.length} re-review, ${needsAssess.length} assess, ${questionTotal} open questions`,
);
