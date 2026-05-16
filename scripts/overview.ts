import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project } from 'ts-morph';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PACKAGE_ORDER = [
  '@flighthq/types',
  '@flighthq/foundation',
  '@flighthq/geometry',
  '@flighthq/assets',
  '@flighthq/materials',
  '@flighthq/scene-graph-core',
  '@flighthq/scene-graph-display',
  '@flighthq/scene-graph-sprite',
  '@flighthq/scene-graph-world',
  '@flighthq/interaction',
  '@flighthq/render-core',
  '@flighthq/render-canvas',
  '@flighthq/animation-spritesheet',
  '@flighthq/animation-timeline',
];

// Maps each package to the corresponding subdirectory in @flighthq/types.
// Types are dissolved into their logical package sections rather than listed as a monolith.
const TYPES_SUBDIR: Record<string, string> = {
  '@flighthq/foundation': 'packages/types/src/foundation/index.ts',
  '@flighthq/geometry': 'packages/types/src/geometry/index.ts',
  '@flighthq/assets': 'packages/types/src/assets/index.ts',
  '@flighthq/materials': 'packages/types/src/materials/index.ts',
  '@flighthq/scene-graph-core': 'packages/types/src/scene/graph/core/index.ts',
  '@flighthq/scene-graph-display': 'packages/types/src/scene/graph/display/index.ts',
  '@flighthq/scene-graph-sprite': 'packages/types/src/scene/graph/sprite/index.ts',
  '@flighthq/interaction': 'packages/types/src/interaction/index.ts',
  '@flighthq/render-core': 'packages/types/src/render/core/index.ts',
  '@flighthq/render-canvas': 'packages/types/src/render/canvas/index.ts',
  '@flighthq/animation-spritesheet': 'packages/types/src/animation/spritesheet/index.ts',
  '@flighthq/animation-timeline': 'packages/types/src/animation/timeline/index.ts',
};

interface PackageInfo {
  name: string;
  description: string;
  indexPath: string;
}

function findPackages(): PackageInfo[] {
  const found = new Map<string, PackageInfo>();

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'package.json') {
        try {
          const pkg = JSON.parse(readFileSync(full, 'utf-8')) as { name?: string; description?: string };
          if (!pkg.name?.startsWith('@flighthq/') || pkg.name === '@flighthq/engine') continue;
          const pkgDir = dirname(full);
          const indexPath = join(pkgDir, 'src', 'index.ts');
          if (existsSync(indexPath)) {
            found.set(pkg.name, { name: pkg.name, description: pkg.description ?? '', indexPath });
          }
        } catch {
          // skip malformed package.json
        }
      }
    }
  }

  walk(join(root, 'packages'));

  return [...found.values()].sort((a, b) => {
    const ai = PACKAGE_ORDER.indexOf(a.name);
    const bi = PACKAGE_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
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

const packages = findPackages();
const detailPackages = packages.filter((p) => p.name !== '@flighthq/types');

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});

const lines: string[] = [
  '# @flighthq Engine — Package Overview',
  '',
  '_Run `npm run overview` to regenerate. Import from `@flighthq/engine` for a single entry point._',
  '_Types from `@flighthq/types` are shown with their logical package rather than as a separate section._',
  '',
  '## Packages',
  '',
  '| Package | Description |',
  '|---------|-------------|',
];

for (const pkg of packages) {
  lines.push(`| \`${pkg.name}\` | ${pkg.description} |`);
}

lines.push('', '---', '');

for (const pkg of detailPackages) {
  lines.push(`## ${pkg.name}`, '');
  if (pkg.description) lines.push(`> ${pkg.description}`, '');

  const impl = collectExports(project, pkg.indexPath);
  const typesRelPath = TYPES_SUBDIR[pkg.name];
  const typesAbsPath = typesRelPath ? join(root, typesRelPath) : null;
  const typesGroup =
    typesAbsPath && existsSync(typesAbsPath)
      ? collectExports(project, typesAbsPath)
      : { functions: [], types: [], values: [] };

  const { functions, types, values } = mergeGroups(impl, typesGroup);

  if (types.length) lines.push(`**Types:** ${list(types)}`, '');
  if (functions.length) lines.push(`**Functions:** ${list(functions)}`, '');
  if (values.length) lines.push(`**Values/Enums:** ${list(values)}`, '');

  lines.push('---', '');
}

const outPath = join(root, 'OVERVIEW.md');
writeFileSync(outPath, lines.join('\n'), 'utf-8');
//eslint-disable-next-line
console.log(`Written ${outPath} (${detailPackages.length} packages with detail)`);
