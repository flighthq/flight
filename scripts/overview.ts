import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project } from 'ts-morph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');
const typesDir = join(packagesDir, 'types', 'src');

interface PackageInfo {
  name: string;
  description: string;
  dir: string;
  indexPath: string;
  deps: string[];
}

function findPackages(): Map<string, PackageInfo> {
  const found = new Map<string, PackageInfo>();

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(readFileSync(full, 'utf-8')) as {
            name?: string;
            description?: string;
            dependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
          };
          if (!pkg.name?.startsWith('@flighthq/') || pkg.name === '@flighthq/sdk') continue;
          const pkgDir = dirname(full);
          const indexPath = join(pkgDir, 'src', 'index.ts');
          if (existsSync(indexPath)) {
            const allDeps = { ...pkg.dependencies, ...pkg.peerDependencies };
            const deps = Object.keys(allDeps).filter((d) => d.startsWith('@flighthq/') && d !== '@flighthq/sdk');
            found.set(pkg.name, { name: pkg.name, description: pkg.description ?? '', dir: pkgDir, indexPath, deps });
          }
        } catch {
          // skip malformed package.json
        }
      }
    }
  }

  walk(packagesDir);
  return found;
}

function topoSort(pkgMap: Map<string, PackageInfo>): PackageInfo[] {
  const sorted: PackageInfo[] = [];
  const visited = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    visited.add(name);
    const pkg = pkgMap.get(name);
    if (!pkg) return;
    for (const dep of [...pkg.deps].sort()) visit(dep);
    sorted.push(pkg);
  }

  for (const name of [...pkgMap.keys()].sort()) visit(name);
  return sorted;
}

function resolveTypesPath(pkg: PackageInfo): string | null {
  const rel = relative(packagesDir, pkg.dir);
  const candidate = join(typesDir, rel, 'index.ts');
  return existsSync(candidate) ? candidate : null;
}

interface ExportGroup {
  functions: string[];
  types: string[];
  values: string[];
}

function collectExports(project: Project, indexPath: string): ExportGroup {
  const sourceFile = project.addSourceFileAtPathIfExists(indexPath) ?? project.addSourceFileAtPath(indexPath);
  const functions: string[] = [];
  const types: string[] = [];
  const values: string[] = [];

  for (const [name, decls] of sourceFile.getExportedDeclarations()) {
    const decl = decls[0];
    if (!decl) continue;

    if (
      Node.isFunctionDeclaration(decl) ||
      Node.isFunctionExpression(decl) ||
      Node.isArrowFunction(decl) ||
      (Node.isVariableDeclaration(decl) &&
        (Node.isArrowFunction(decl.getInitializer()) || Node.isFunctionExpression(decl.getInitializer())))
    ) {
      functions.push(name);
    } else if (Node.isInterfaceDeclaration(decl) || Node.isTypeAliasDeclaration(decl)) {
      types.push(name);
    } else {
      values.push(name);
    }
  }

  return { functions: functions.sort(), types: types.sort(), values: values.sort() };
}

function mergeGroups(...groups: ExportGroup[]): ExportGroup {
  const functions = [...new Set(groups.flatMap((g) => g.functions))].sort();
  const types = [...new Set(groups.flatMap((g) => g.types))].sort();
  const values = [...new Set(groups.flatMap((g) => g.values))].sort();
  return { functions, types, values };
}

function list(items: string[]): string {
  return items.map((n) => `\`${n}\``).join(', ');
}

// --- main ---

const pkgMap = findPackages();
const packages = topoSort(pkgMap);
const detailPackages = packages.filter((p) => p.name !== '@flighthq/types');

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});

const lines: string[] = [
  '# @flighthq Engine — Package Overview',
  '',
  '_Run `npm run overview` to regenerate. Import from `@flighthq/sdk` for a single entry point._ _Types from `@flighthq/types` are shown with their logical package rather than as a separate section._',
  '',
  '## Packages',
  '',
  '| Package | Description |',
  '| --- | --- |',
];

for (const pkg of packages) {
  lines.push(`| \`${pkg.name}\` | ${pkg.description} |`);
}

lines.push('', '---', '');

for (const pkg of detailPackages) {
  lines.push(`## ${pkg.name}`, '');
  if (pkg.description) lines.push(`> ${pkg.description}`, '');

  const impl = collectExports(project, pkg.indexPath);
  const typesPath = resolveTypesPath(pkg);
  const typesGroup = typesPath ? collectExports(project, typesPath) : { functions: [], types: [], values: [] };

  const { functions, types, values } = mergeGroups(impl, typesGroup);

  if (types.length) lines.push(`**Types:** ${list(types)}`, '');
  if (functions.length) lines.push(`**Functions:** ${list(functions)}`, '');
  if (values.length) lines.push(`**Values/Enums:** ${list(values)}`, '');

  lines.push('---', '');
}

const outPath = join(root, 'OVERVIEW.md');
writeFileSync(outPath, lines.join('\n'), 'utf-8');
console.log(`Written ${outPath} (${detailPackages.length} packages with detail)`);
