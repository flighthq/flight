// Triage the draft charters into a bless queue — attention-sorted — plus a fork cross-reference.
//
//   node agents/packages/bless-queue.mjs
//
// Run AFTER the migration workflow completes (cells must be stable). Reads each cell's charter.md +
// review.md, scores how much of your attention each draft needs, and writes an ephemeral report to
// reports/bless-queue.md (gitignored). Authored charters (blessed: no draft flag, non-null
// lastDirection) are excluded — they are done.
//
// Attention score = (# Open directions) + stub/partial penalty + (forks-touched × 2) + contradiction.
// Tiers: Deep (≥6) — North star is a guess or the package sits on an unresolved fork; real attention.
//        Review (3–5) — skim and edit.  Fast-bless (<3) — proposal is likely obvious; batch them.
//
// The fork cross-reference groups drafts by the SDK-wide fork each one touches, so you resolve a fork
// once and see every draft it lands on (the quick form of fork-propagation).

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const reportsDir = join(repoRoot, 'reports');

// SDK-wide forks → detection keywords (heuristic; see structural-forks.md).
const FORKS = {
  'source-data/node': /source.data|renderable node|graph participation|node layer|reserveParticle/i,
  registry: /registry|closed union|switch ?\(.*kind|register[A-Z]\w+/,
  'subject-triad': /subject triad|-formats|-backend|plurality/i,
  '2D/3D-additive': /2d\/3d|strictly additive|pays nothing|size.gate/i,
  'resources-dissolve': /textureatlas|tileset|grab.bag|dissolve/i,
  bedrock: /bedrock|blood from a stone/i,
};

function parseFrontMatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^([\w-]+):\s*(.*)$/);
    if (mm) fm[mm[1]] = mm[2].trim();
  }
  return fm;
}

// Count bullet lines under a "## <heading>…" section.
function countSection(text, heading) {
  const re = new RegExp(`^##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$)`, 'm');
  const m = text.match(re);
  if (!m) return 0;
  return (m[1].match(/^\s*[-*]\s+\S/gm) ?? []).length;
}

const names = readdirSync(here, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const rows = [];
const forkIndex = Object.fromEntries(Object.keys(FORKS).map((k) => [k, []]));

for (const name of names) {
  const charterPath = join(here, name, 'charter.md');
  const reviewPath = join(here, name, 'review.md');
  if (!existsSync(charterPath)) continue;
  const charter = readFileSync(charterPath, 'utf8');
  const cfm = parseFrontMatter(charter);

  const isDraft = cfm.draft === 'true';
  const blessed = !isDraft && cfm.lastDirection && cfm.lastDirection !== 'null';
  if (blessed) continue; // already authored — done

  const review = existsSync(reviewPath) ? readFileSync(reviewPath, 'utf8') : '';
  const rfm = parseFrontMatter(review);
  const status = rfm.status ?? '?';
  const score = rfm.score ?? '?';

  const openDirs = countSection(charter, 'Open directions');
  const contradiction = /##\s+Charter contradictions[^\n]*\n+(?!\s*_?[Nn]one)/.test(review) ? 1 : 0;
  const text = `${charter}\n${review}`;
  const forks = Object.entries(FORKS)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
  for (const f of forks) forkIndex[f].push(name);

  const penalty = status === 'stub' ? 3 : status === 'partial' ? 1 : 0;
  const attention = openDirs + penalty + forks.length * 2 + contradiction * 2;
  const tier = attention >= 6 ? 'Deep' : attention >= 3 ? 'Review' : 'Fast';
  rows.push({ name, status, score, openDirs, forks, contradiction, attention, tier, hasReview: !!review });
}

rows.sort((a, b) => b.attention - a.attention || a.name.localeCompare(b.name));

const tierCount = (t) => rows.filter((r) => r.tier === t).length;
const lines = [];
lines.push('# Bless Queue (generated)\n');
lines.push(
  `${rows.length} draft charters awaiting blessing — **${tierCount('Deep')} Deep**, ` +
    `${tierCount('Review')} Review, ${tierCount('Fast')} Fast-bless. Attention-sorted. Ephemeral; regenerate anytime.\n`,
);
lines.push('| Pkg | Tier | Verdict | Open dirs | Forks touched | Attn |');
lines.push('| --- | --- | --- | --: | --- | --: |');
for (const r of rows) {
  lines.push(
    `| \`${r.name}\` | ${r.tier} | ${r.status} ${r.score} | ${r.openDirs}${r.contradiction ? ' ⚠' : ''} | ${r.forks.join(', ') || '—'} | ${r.attention} |`,
  );
}
lines.push('\n## Fork cross-reference (resolve once → applies to all listed)\n');
for (const [fork, pkgs] of Object.entries(forkIndex)) {
  if (pkgs.length) lines.push(`- **${fork}** (${pkgs.length}): ${pkgs.map((p) => `\`${p}\``).join(', ')}`);
}

mkdirSync(reportsDir, { recursive: true });
writeFileSync(join(reportsDir, 'bless-queue.md'), `${lines.join('\n')}\n`);
console.log(
  `Wrote reports/bless-queue.md — ${rows.length} drafts (${tierCount('Deep')} Deep, ${tierCount('Review')} Review, ${tierCount('Fast')} Fast).`,
);
