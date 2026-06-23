/**
 * Regenerate tools/agents/proposals/index.md from each proposal's frontmatter.
 *
 * The proposals folder is flat with status in frontmatter (no proposed/approved subfolders), so this
 * index is the at-a-glance view: proposals grouped by status, then by type. Run after editing
 * statuses. See tools/agents/proposals/README.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'tools/agents/proposals');
const SKIP = new Set(['README.md', 'TEMPLATE.md', 'index.md']);
const STATUS_ORDER = ['building', 'approved', 'proposed', 'done', 'superseded'];

interface Meta {
  file: string;
  id: string;
  type: string;
  target: string;
  status: string;
  tier: string;
  updated: string;
}

function frontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const f = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (f) out[f[1]] = f[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

const metas: Meta[] = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.md') && !SKIP.has(f))
  .map((file) => {
    const fm = frontmatter(fs.readFileSync(path.join(DIR, file), 'utf8'));
    return {
      file,
      id: fm.id ?? file.replace(/\.md$/, ''),
      type: fm.type ?? '?',
      target: fm.target ?? file.replace(/\.md$/, ''),
      status: fm.status ?? 'proposed',
      tier: fm.tier ?? '',
      updated: fm.updated ?? '',
    };
  });

const counts: Record<string, number> = {};
for (const m of metas) counts[m.status] = (counts[m.status] ?? 0) + 1;
const statuses = [...new Set([...STATUS_ORDER, ...Object.keys(counts)])].filter((s) => counts[s]);

let md = '# Build Proposals — Index\n\n';
md += `Generated from frontmatter by \`npm run proposals:index\`. ${metas.length} proposals. `;
md += 'Flat folder; lifecycle is the `status:` field (see [README](README.md)).\n\n';
md += '## By status\n\n| Status | Count |\n|---|--:|\n';
for (const s of statuses) md += `| ${s} | ${counts[s]} |\n`;

const typeLabel = (t: string) => (t === 'new-package' ? 'new package' : t);
for (const s of statuses) {
  const rows = metas
    .filter((m) => m.status === s)
    .sort((a, b) => a.type.localeCompare(b.type) || a.target.localeCompare(b.target));
  md += `\n## ${s} (${rows.length})\n\n| Proposal | Type | Tier | Updated |\n|---|---|---|---|\n`;
  for (const m of rows) md += `| [\`${m.target}\`](${m.file}) | ${typeLabel(m.type)} | ${m.tier} | ${m.updated} |\n`;
}
md += '\n';

fs.writeFileSync(path.join(DIR, 'index.md'), md);
console.log(`Wrote index.md — ${metas.length} proposals: ${statuses.map((s) => `${counts[s]} ${s}`).join(', ')}.`);
