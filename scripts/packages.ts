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

interface CheckError {
  label: string;
  detail?: string;
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

function check(errors: CheckError[], label: string, ok: boolean, detail?: string): boolean {
  if (!ok) errors.push({ label, detail });
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

function checkPackageTargetPaths(errors: CheckError[], pkgDir: string, targets: Iterable<string>): void {
  const checkedSourcePaths = new Set<string>();

  for (const target of targets) {
    const sourcePath = getSourcePathForDistTarget(pkgDir, target);
    if (sourcePath === null) continue;
    if (checkedSourcePaths.has(sourcePath)) continue;
    checkedSourcePaths.add(sourcePath);

    check(
      errors,
      `${sourcePath.replace(pkgDir + '\\', '')} exists for package target`,
      existsSync(sourcePath),
      `referenced by ${target}`,
    );
  }
}

function getSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(path));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      files.push(path);
    }
  }
  return files;
}

function skipOuterExpressions(expression: ts.Expression): ts.Expression {
  let e: ts.Expression = expression;
  while (true) {
    if (ts.isParenthesizedExpression(e)) {
      e = e.expression;
      continue;
    }
    if (e.kind === ts.SyntaxKind.AsExpression) {
      e = (e as unknown as { expression: ts.Expression }).expression;
      continue;
    }
    if (e.kind === ts.SyntaxKind.TypeAssertionExpression) {
      e = (e as unknown as { expression: ts.Expression }).expression;
      continue;
    }
    break;
  }
  return e;
}

function isTopLevelSideEffectStatement(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;

  const expression = skipOuterExpressions(statement.expression);
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

function checkNoTopLevelSideEffects(errors: CheckError[], pkgDir: string): void {
  const sideEffects: string[] = [];

  for (const sourcePath of getSourceFiles(join(pkgDir, 'src'))) {
    const sourceFile = ts.createSourceFile(sourcePath, readFileSync(sourcePath, 'utf-8'), ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (!isTopLevelSideEffectStatement(statement)) continue;

      const { line, character } = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile));
      sideEffects.push(`${sourcePath.replace(pkgDir + '\\', '')}:${line + 1}:${character + 1}`);
    }
  }

  check(errors, 'no top-level side effects in src modules', sideEffects.length === 0, sideEffects.join(', '));
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
const expectedCleanScript = 'tsc -b --clean';
const expectedCleanDistScript = 'tsx ../../scripts/clean-package-dist.ts';
const expectedPrepackScript = 'npm run clean && npm run clean:dist && npm run build';

// --- check each package ---

interface PackageResult {
  name: string;
  errors: CheckError[];
}

const results: PackageResult[] = [];

for (const pkgDir of packageDirs) {
  const pkg = readJson<PackageJson>(join(pkgDir, 'package.json'));

  if (!pkg?.name) continue;

  const name = pkg.name;
  const errors: CheckError[] = [];

  for (const rel of ['vitest.config.ts', 'tsconfig.json', 'src/index.ts']) {
    check(errors, `${rel} exists`, existsSync(join(pkgDir, rel)));
  }

  check(errors, 'sideEffects is false', pkg.sideEffects === false, `got ${JSON.stringify(pkg.sideEffects)}`);
  checkNoTopLevelSideEffects(errors, pkgDir);

  check(
    errors,
    'files field is correct',
    JSON.stringify(pkg.files ?? []) === JSON.stringify(expectedPackageFiles),
    `got ${JSON.stringify(pkg.files)}`,
  );

  check(
    errors,
    'prepack script',
    pkg.scripts?.prepack === expectedPrepackScript,
    `got ${JSON.stringify(pkg.scripts?.prepack)}`,
  );
  check(
    errors,
    'clean script',
    pkg.scripts?.clean === expectedCleanScript,
    `got ${JSON.stringify(pkg.scripts?.clean)}`,
  );
  check(
    errors,
    'clean:dist script',
    pkg.scripts?.['clean:dist'] === expectedCleanDistScript,
    `got ${JSON.stringify(pkg.scripts?.['clean:dist'])}`,
  );

  check(errors, `${name} in tsconfig.base.json paths`, name in tsconfigPaths);
  check(errors, `${name}/* in tsconfig.base.json paths`, `${name}/*` in tsconfigPaths);

  const dirName = pkgDir.split(/[\\/]/).at(-1)!;
  check(errors, `${dirName} in tsconfig.build.json references`, buildRefs.has(dirName));

  const allDeps: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.peerDependencies,
    ...pkg.devDependencies,
  };
  for (const [dep, version] of Object.entries(allDeps)) {
    if (dep.startsWith('@flighthq/')) {
      check(errors, `${dep} uses "*"`, version === '*', `got "${version}"`);
    }
  }

  const packageTargets = new Set<string>();
  if (pkg.main) packageTargets.add(pkg.main);
  if (pkg.module) packageTargets.add(pkg.module);
  if (pkg.types) packageTargets.add(pkg.types);
  collectPackageTargetPaths(pkg.exports, packageTargets);
  checkPackageTargetPaths(errors, pkgDir, packageTargets);

  results.push({ name, errors });
}

// --- report ---

const failed = results.filter((r) => r.errors.length > 0);
const totalErrors = failed.reduce((n, r) => n + r.errors.length, 0);

for (const { name, errors } of failed) {
  console.log(`\n${pc.bold(name)}`);
  for (const { label, detail } of errors) {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
}

if (totalErrors === 0) {
  console.log(pc.green(`✓ ${results.length} packages valid`));
  process.exit(0);
} else {
  console.log('');
  console.log(
    pc.red(
      `✗ ${totalErrors} error${totalErrors === 1 ? '' : 's'} across ${failed.length} package${failed.length === 1 ? '' : 's'}`,
    ),
  );
  process.exit(1);
}
