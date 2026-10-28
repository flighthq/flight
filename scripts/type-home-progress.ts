// Structural meter for the D8/T4 type-home migration. Exported types belong to their defining
// package; @flighthq/types is only the transitional compatibility facade. Report package-owned
// declarations as progress and declarations still centralized in types as migration debt. This is
// deliberately not an ownership gate and derives both populations from source, without a package
// approval list or a frozen declaration manifest.
//
//   npx tsx scripts/type-home-progress.ts          # meter (always exit 0)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { getParsedOxcSource } from './oxc-source.ts';
import { getSelectors, selectPackages } from './select.ts';

const root = process.cwd();
const packagesDir = join(root, 'packages');
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

const perOwnerPackage: Array<{ pkg: string; count: number }> = [];
let ownerTypeCount = 0;
for (const e of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!e.isDirectory() || e.name === 'types') continue;
  if (!selected.has(e.name)) continue;
  let count = 0;
  for (const f of sourceFiles(join(packagesDir, e.name, 'src'))) count += exportedTypeNames(f).length;
  if (count > 0) {
    perOwnerPackage.push({ pkg: e.name, count });
    ownerTypeCount += count;
  }
}

perOwnerPackage.sort((a, b) => b.count - a.count || a.pkg.localeCompare(b.pkg));
for (const { pkg, count } of perOwnerPackage) console.log(`  ${String(count).padStart(4)}  @flighthq/${pkg}`);

console.log(`\n  ${perOwnerPackage.length} defining packages, ${ownerTypeCount} package-owned exported types`);
if (selected.has('types')) {
  let centralizedTypeCount = 0;
  for (const f of sourceFiles(join(packagesDir, 'types', 'src'))) centralizedTypeCount += exportedTypeNames(f).length;
  console.log(`  ${centralizedTypeCount} legacy exported type declarations remain in @flighthq/types`);
} else {
  console.log('  legacy @flighthq/types declarations not scanned by the current selector');
}
