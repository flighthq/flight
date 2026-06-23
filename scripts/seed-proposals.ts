/**
 * Bootstrap build proposals from the maturation analysis.
 *
 * For each maturation doc under tools/agents/docs/reviews/maturation/{depth,breadth}/, create a
 * proposal in tools/agents/proposals/ (one file per package). Depth docs become `type: depth`
 * proposals (build depth into an existing package); breadth docs become `type: new-package`
 * proposals (build out a new package).
 *
 * NON-DESTRUCTIVE: a proposal that already exists is skipped, never overwritten — so this is safe to
 * re-run after a new maturation pass to pick up newly-proposed packages without clobbering proposals
 * you've already shaped. See tools/agents/proposals/README.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MATURATION = path.join(ROOT, 'tools/agents/docs/reviews/maturation');
const OUT = path.join(ROOT, 'tools/agents/proposals');
const today = new Date().toISOString().slice(0, 10);

interface Doc {
  intro: string;
  sections: Map<string, string>; // lowercased header → body
}

function parseDoc(content: string): Doc {
  const lines = content.split('\n');
  const sections = new Map<string, string>();
  let intro: string[] = [];
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current !== null) sections.set(current.toLowerCase(), buf.join('\n').trim());
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(/^##\s+(.*)$/);
    if (m) {
      flush();
      current = m[1].trim();
    } else if (current === null) {
      if (!/^#\s/.test(line)) intro.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return { intro: intro.join('\n').trim(), sections };
}

// section body whose header starts with `name` (case-insensitive)
function section(doc: Doc, name: string): string | null {
  for (const [k, v] of doc.sections) if (k.startsWith(name.toLowerCase())) return v;
  return null;
}

function introField(intro: string, label: string): string {
  // tolerate the colon inside or outside the bold: **Label** / **Label:** / **Label**:
  const re = new RegExp('\\*\\*\\s*' + label + '\\s*:?\\s*\\*\\*\\s*:?\\s*([^\\n]+)', 'i');
  const m = intro.match(re);
  return m ? m[1].replace(/^[—:\-\s]+/, '').trim() : '';
}

function buildProposal(opts: {
  type: 'depth' | 'new-package';
  target: string;
  doc: Doc;
  maturationRel: string;
  sources: string[];
}): string {
  const { type, target, doc, sources } = opts;
  const summary =
    type === 'depth'
      ? introField(doc.intro, 'Current verdict') || 'Mature this existing package.'
      : introField(doc.intro, 'Represents') || 'Build out this new package.';
  const bronze = section(doc, 'Bronze') ?? '- …';
  const silver = section(doc, 'Silver') ?? '- …';
  const gold = section(doc, 'Gold') ?? '- …';
  const boundaries = section(doc, 'Boundaries');
  const openQ = section(doc, 'Open design questions') ?? section(doc, 'Open questions');
  const sequencing = section(doc, 'Sequencing');

  const fm = [
    '---',
    `id: ${target}`,
    `title: '@flighthq/${target}'`,
    `type: ${type}`,
    `target: ${target}`,
    'status: proposed',
    'tier: bronze',
    'source:',
    ...sources.map((s) => `  - ${s}`),
    'depends_on: []',
    `updated: ${today}`,
    '---',
  ].join('\n');

  const newPkg = type === 'new-package';
  const acceptance = [
    '## Acceptance',
    '',
    '- [ ] Shared types defined in `@flighthq/types` first',
    '- [ ] `npm run check` passes',
    `- [ ] \`npm run packages:check\` passes${newPkg ? ' (valid manifest, tree-shakable, `sideEffects:false`)' : ''}`,
    '- [ ] Colocated test per export (`npm run exports:check`)',
    '- [ ] `npm run order` / `npm run api` clean',
    ...(newPkg ? ['- [ ] Added to the Package Map in `tools/agents/docs/index.md`'] : []),
    '- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered',
  ].join('\n');

  const brief = newPkg
    ? `> Create \`@flighthq/${target}\` by copying a nearby package's shape, then build it to the **Bronze** tier per the Scope + Design above. Define all shared types in \`@flighthq/types\` first. Follow the CLAUDE.md conventions (free functions, \`Readonly\` by default, sentinels over throws, tree-shakable, \`-formats\`/backend-seam patterns where relevant). Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.`
    : `> Build \`@flighthq/${target}\` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in \`@flighthq/types\` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.`;

  const body = [
    '## Summary',
    '',
    summary,
    '',
    '## Scope (this build)',
    '',
    'Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.',
    '',
    '- [ ] Bronze',
    '- [ ] Silver',
    '- [ ] Gold',
    '',
    '## Design',
    '',
    '### Bronze',
    '',
    bronze,
    '',
    '### Silver',
    '',
    silver,
    '',
    '### Gold',
    '',
    gold,
    ...(boundaries ? ['', '## Boundaries', '', boundaries] : []),
    ...(sequencing ? ['', '## Sequencing & effort', '', sequencing] : []),
    '',
    acceptance,
    '',
    '## Open questions',
    '',
    openQ && openQ.trim() ? openQ : '- _(none captured yet)_',
    '',
    '## Agent brief',
    '',
    brief,
    '',
    '## Decision log',
    '',
    `- ${today} — seeded from maturation analysis (status: proposed).`,
    '',
  ].join('\n');

  return fm + '\n\n' + body;
}

function run() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  let created = 0;
  let skipped = 0;
  const jobs: { type: 'depth' | 'new-package'; dir: string }[] = [
    { type: 'depth', dir: path.join(MATURATION, 'depth') },
    { type: 'new-package', dir: path.join(MATURATION, 'breadth') },
  ];
  for (const { type, dir } of jobs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'index.md')) {
      const target = file.replace(/\.md$/, '');
      const outPath = path.join(OUT, `${target}.md`);
      if (fs.existsSync(outPath)) {
        skipped++;
        continue;
      }
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const doc = parseDoc(content);
      const maturationRel = path.relative(ROOT, path.join(dir, file));
      const sources = [maturationRel];
      if (type === 'depth') {
        sources.push(`tools/agents/docs/reviews/depth/${target}.md`);
      } else {
        const by = introField(doc.intro, 'Requested by');
        for (const key of by
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)) {
          sources.push(`tools/agents/docs/reviews/breadth/${key}.md`);
        }
      }
      fs.writeFileSync(outPath, buildProposal({ type, target, doc, maturationRel, sources }));
      created++;
    }
  }
  console.log(`Proposals: created ${created}, skipped ${skipped} (already existed). Run \`npm run proposals:index\`.`);
}

run();
