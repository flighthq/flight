// Guard for the staged D8 type-home migration. Approved packages may own their exported types;
// @flighthq/types remains a compatibility aggregator until the broader dissolution lands. Reports
// exported interface/type/enum declarations in packages whose owner migration is not yet approved.
// Run as a meter during the migration; pass --gate to reject an unapproved owner move.
//
//   npx tsx scripts/type-home-progress.ts          # meter (always exit 0)
//   npx tsx scripts/type-home-progress.ts --gate    # exit 1 for types in an unapproved owner package
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getParsedOxcSource } from './oxc-source.ts';
import { getSelectors, selectPackages } from './select.ts';

const root = process.cwd();
const packagesDir = join(root, 'packages');
const gate = process.argv.includes('--gate');
const selected = new Set(selectPackages(getSelectors()));

// Completed Tier 4 owner-package decisions in agents/ts-rust-alignment.md. Keep this list narrow:
// adding a package is an ownership decision, not a way to silence the gate.
const approvedOwnerPackages = new Set(['buffer', 'meshgeometry', 'resource', 'textformat']);

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (
      e.isFile() &&
      e.name.endsWith('.ts') &&
      !e.name.endsWith('.test.ts') &&
      !e.name.endsWith('.spec.ts') &&
      !e.name.endsWith('TestHelper.ts') // test-only mock types are exempt (see file-naming.md)
    )
      out.push(p);
  }
  return out;
}

function exportedTypeNames(file: string): string[] {
  const text = readFileSync(file, 'utf-8');
  if (!/\bexport\s+(?:(?:declare|const)\s+)*(?:interface|type|enum)\b/.test(text)) return [];
  const names: string[] = [];
  for (const statement of getParsedOxcSource(file).program.body) {
    if (statement.type !== 'ExportNamedDeclaration') continue;
    const declaration = statement.declaration;
    if (
      declaration?.type === 'TSInterfaceDeclaration' ||
      declaration?.type === 'TSTypeAliasDeclaration' ||
      declaration?.type === 'TSEnumDeclaration'
    ) {
      names.push(declaration.id.name);
    }
  }
  return names;
}

const perPackage: Array<{ pkg: string; count: number }> = [];
let total = 0;
for (const e of readdirSync(packagesDir, { withFileTypes: true })) {
  // tool-*, vite-plugin-*, and *-wasm are build-side or bridge tiers: their exported types name
  // bundler/Node/wasm surfaces that @flighthq/types must not depend on.
  if (
    !e.isDirectory() ||
    e.name === 'types' ||
    approvedOwnerPackages.has(e.name) ||
    e.name.startsWith('tool-') ||
    e.name.startsWith('vite-plugin-') ||
    e.name.endsWith('-wasm')
  )
    continue;
  if (!selected.has(e.name)) continue;
  let count = 0;
  for (const f of sourceFiles(join(packagesDir, e.name, 'src'))) count += exportedTypeNames(f).length;
  if (count > 0) {
    perPackage.push({ pkg: e.name, count });
    total += count;
  }
}

perPackage.sort((a, b) => b.count - a.count);
for (const { pkg, count } of perPackage) console.log(`  ${String(count).padStart(4)}  @flighthq/${pkg}`);
console.log(`\n  ${perPackage.length} packages, ${total} exported types in unapproved owner packages`);

if (gate && total > 0) {
  console.error(`\ntype-home gate: ${total} exported types need an approved owner-package decision`);
  process.exit(1);
}
