// Progress meter for the type-home migration: every exported type belongs in @flighthq/types
// (see agents/conventions/file-naming.md). Reports exported interface/type/enum declarations still
// living outside packages/types, per package. Run as a meter during the migration; pass --gate to
// exit non-zero while any remain (the eventual hard packages:check).
//
//   npx tsx scripts/type-home-progress.ts          # meter (always exit 0)
//   npx tsx scripts/type-home-progress.ts --gate    # exit 1 if any exported types remain outside types
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getParsedOxcSource } from './oxc-source';
import { getSelectors, selectPackages } from './select';

const root = process.cwd();
const packagesDir = join(root, 'packages');
const gate = process.argv.includes('--gate');
const selected = new Set(selectPackages(getSelectors()));

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
  if (!e.isDirectory() || e.name === 'types' || e.name.startsWith('tool-')) continue; // tool-* tier exempt
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
console.log(`\n  ${perPackage.length} packages, ${total} exported types still outside @flighthq/types`);

if (gate && total > 0) {
  console.error(`\ntype-home gate: ${total} exported types must move to @flighthq/types`);
  process.exit(1);
}
