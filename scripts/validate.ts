import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import * as ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

interface PackageJson {
  name?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: PackageExports;
  files?: string[];
  sideEffects?: boolean | string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

type PackageExportTarget = string | { [condition: string]: PackageExportTarget } | PackageExportTarget[];
type PackageExports = PackageExportTarget | Record<string, PackageExportTarget>;

interface TsConfigBase {
  compilerOptions?: {
    paths?: Record<string, string[]>;
  };
}

interface TsConfigBuild {
  references?: { path: string }[];
}

function stripJsonComments(text: string): string {
  let result = '';
  let i = 0;
  const len = text.length;
  while (i < len) {
    if (text[i] === '"') {
      result += text[i++];
      while (i < len) {
        if (text[i] === '\\') {
          result += text[i] + text[i + 1];
          i += 2;
        } else if (text[i] === '"') {
          result += text[i++];
          break;
        } else {
          result += text[i++];
        }
      }
    } else if (text[i] === '/' && text[i + 1] === '/') {
      while (i < len && text[i] !== '\n') i++;
    } else if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < len && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += text[i++];
    }
  }
  return result;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(stripJsonComments(readFileSync(path, 'utf-8'))) as T;
  } catch {
    return null;
  }
}

function check(label: string, ok: boolean, detail?: string): boolean {
  if (ok) {
    console.log(`  ${pc.green('✓')} ${label}`);
  } else {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
  return ok;
}

function collectPackageTargetPaths(target: PackageExportTarget | undefined, out: Set<string>): void {
  if (target === undefined) return;

  if (typeof target === 'string') {
    out.add(target);
    return;
  }

  if (Array.isArray(target)) {
    for (const item of target) collectPackageTargetPaths(item, out);
    return;
  }

  for (const value of Object.values(target)) collectPackageTargetPaths(value, out);
}

function getSourcePathForDistTarget(pkgDir: string, target: string): string | null {
  const normalized = target.replaceAll('\\', '/');
  if (!normalized.startsWith('./dist/')) return null;

  const withoutDist = normalized.slice('./dist/'.length);
  const sourceRel = withoutDist.replace(/\.d\.ts$/, '.ts').replace(/\.js$/, '.ts');
  return join(pkgDir, 'src', sourceRel);
}

function checkPackageTargetPaths(pkgDir: string, targets: Iterable<string>): number {
  let errors = 0;
  const checkedSourcePaths = new Set<string>();

  for (const target of targets) {
    const sourcePath = getSourcePathForDistTarget(pkgDir, target);
    if (sourcePath === null) continue;
    if (checkedSourcePaths.has(sourcePath)) continue;
    checkedSourcePaths.add(sourcePath);

    const ok = existsSync(sourcePath);
    if (!check(`${sourcePath.replace(pkgDir + '\\', '')} exists for package target`, ok, `referenced by ${target}`)) errors++;
  }

  return errors;
}

function getSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
      files.push(path);
    }
  }
  return files;
}

function isTopLevelSideEffectStatement(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;

  const expression = ts.skipOuterExpressions(statement.expression);
  return (
    ts.isCallExpression(expression) ||
    ts.isNewExpression(expression) ||
    ts.isBinaryExpression(expression) ||
    ts.isPrefixUnaryExpression(expression) ||
    ts.isPostfixUnaryExpression(expression) ||
    ts.isDeleteExpression(expression) ||
    ts.isAwaitExpression(expression)
  );
}

function checkNoTopLevelSideEffects(pkgDir: string): number {
  let errors = 0;
  const sideEffects: string[] = [];

  for (const sourcePath of getSourceFiles(join(pkgDir, 'src'))) {
    const sourceFile = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf-8'), ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!isTopLevelSideEffectStatement(statement)) continue;

      const { line, character } = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
      sideEffects.push(`${sourcePath.replace(pkgDir + '\\', '')}:${line + 1}:${character + 1}`);
    }
  }

  const ok = sideEffects.length === 0;
  if (!check('no top-level executable side effects in src modules', ok, sideEffects.join(', '))) errors++;
  return errors;
}

// --- load tsconfig.base.json paths ---

const tsconfigPath = join(root, 'tsconfig.base.json');
const tsconfig = readJson<TsConfigBase>(tsconfigPath);
const tsconfigPaths = tsconfig?.compilerOptions?.paths ?? {};

// --- load tsconfig.build.json references ---

const tsconfigBuildPath = join(root, 'tsconfig.build.json');
const tsconfigBuild = readJson<TsConfigBuild>(tsconfigBuildPath);
const buildRefs = new Set((tsconfigBuild?.references ?? []).map((r) => r.path.replace(/^\.\/packages\//, '')));

// --- discover workspace packages ---

const packageDirs = readdirSync(packagesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(packagesDir, e.name));

const expectedPackageFiles = [
  'dist',
  'src/**/*.test.ts',
  '!dist/**/*.test.js',
  '!dist/**/*.test.d.ts',
  '!dist/**/*.test.js.map',
  '!dist/**/*.test.d.ts.map',
];
const expectedCleanScript = 'tsc -b --clean && node -e "require(\'node:fs\').rmSync(\'dist\',{recursive:true,force:true})"';

let totalErrors = 0;

for (const pkgDir of packageDirs) {
  const pkgJsonPath = join(pkgDir, 'package.json');
  const pkg = readJson<PackageJson>(pkgJsonPath);

  if (!pkg || !pkg.name) {
    console.log(pc.yellow(`\nskip ${pkgDir} — no package.json or missing name`));
    continue;
  }

  const name = pkg.name;
  console.log(`\n${pc.bold(name)}`);

  let errors = 0;

  // required files
  const requiredFiles = ['vitest.config.ts', 'tsconfig.json', 'src/index.ts'];
  for (const rel of requiredFiles) {
    const ok = existsSync(join(pkgDir, rel));
    if (!check(rel, ok, `missing ${join(pkgDir, rel)}`)) errors++;
  }

  const sideEffectsOk = check('sideEffects is false', pkg.sideEffects === false, `got ${JSON.stringify(pkg.sideEffects)}`);
  if (!sideEffectsOk) errors++;
  errors += checkNoTopLevelSideEffects(pkgDir);

  const filesOk = check(
    'package files include dist, source tests, and exclude compiled tests',
    JSON.stringify(pkg.files ?? []) === JSON.stringify(expectedPackageFiles),
    `got ${JSON.stringify(pkg.files)}`,
  );
  if (!filesOk) errors++;

  const prepackOk = check(
    'prepack cleans and builds package',
    pkg.scripts?.prepack === 'npm run clean && npm run build',
    `got ${JSON.stringify(pkg.scripts?.prepack)}`,
  );
  if (!prepackOk) errors++;

  const cleanOk = check(
    'clean removes dist output',
    pkg.scripts?.clean === expectedCleanScript,
    `got ${JSON.stringify(pkg.scripts?.clean)}`,
  );
  if (!cleanOk) errors++;

  // tsconfig.base.json paths entries
  const pathKey = name;
  const pathWildKey = `${name}/*`;
  const hasPath = check(`${pathKey} in tsconfig.base.json paths`, pathKey in tsconfigPaths);
  const hasWildPath = check(`${pathWildKey} in tsconfig.base.json paths`, pathWildKey in tsconfigPaths);
  if (!hasPath) errors++;
  if (!hasWildPath) errors++;

  // tsconfig.build.json references
  const dirName = pkgDir.split(/[\\/]/).at(-1)!;
  const inBuild = check(`${dirName} in tsconfig.build.json references`, buildRefs.has(dirName));
  if (!inBuild) errors++;

  // workspace dependency version convention
  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  for (const [dep, version] of Object.entries(allDeps)) {
    if (!dep.startsWith('@flighthq/')) continue;
    const ok = version === '*';
    if (!check(`${dep} uses "*"`, ok, `got "${version}"`)) errors++;
  }

  // exports / main (optional warning, not an error)
  const hasExports = pkg.exports !== undefined || pkg.main !== undefined || pkg.module !== undefined;
  if (!hasExports) {
    console.log(`  ${pc.dim('·')} ${pc.dim('no exports/main/module (optional)')}`);
  }

  // package entry target paths
  const packageTargets = new Set<string>();
  if (pkg.main) packageTargets.add(pkg.main);
  if (pkg.module) packageTargets.add(pkg.module);
  if (pkg.types) packageTargets.add(pkg.types);
  collectPackageTargetPaths(pkg.exports, packageTargets);
  errors += checkPackageTargetPaths(pkgDir, packageTargets);

  totalErrors += errors;
}

console.log('');

if (totalErrors === 0) {
  console.log(pc.green(`✓ All packages valid`));
  process.exit(0);
} else {
  console.log(pc.red(`✗ ${totalErrors} error${totalErrors === 1 ? '' : 's'} found`));
  process.exit(1);
}
