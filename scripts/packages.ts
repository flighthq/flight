import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import * as ts from 'typescript';

import { isSdkBarrelExcludedPackage } from './sdk-policy';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const packagesDir = join(root, 'packages');

interface ExamplePackageJson {
  name?: string;
  private?: boolean;
  type?: string;
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface ExampleTsConfig {
  extends?: string;
  references?: { path: string }[];
}

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

interface PackageTsConfig {
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

function getAllTsFiles(dir: string): { source: string[]; test: string[] } {
  if (!existsSync(dir)) return { source: [], test: [] };

  const source: string[] = [];
  const test: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = getAllTsFiles(path);
      source.push(...sub.source);
      test.push(...sub.test);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.spec.ts')) {
        test.push(path);
      } else {
        source.push(path);
      }
    }
  }
  return { source, test };
}

function scanFlightImports(files: string[]): Set<string> {
  const imports = new Set<string>();
  for (const filePath of files) {
    const sourceFile = ts.createSourceFile(filePath, readFileSync(filePath, 'utf-8'), ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      let specifier: string | undefined;
      if (
        ts.isImportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        specifier = statement.moduleSpecifier.text;
      } else if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        specifier = statement.moduleSpecifier.text;
      }
      if (specifier?.startsWith('@flighthq/')) {
        imports.add(specifier);
      }
    }
  }
  return imports;
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

const tsconfigBasePath = join(root, 'tsconfig.base.json');
const tsconfig = readJson<TsConfigBase>(tsconfigBasePath);
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
  // Wasm-backed (`-rs`) packages depend on generated wasm (baked by `build:wasm`)
  // and are intentionally kept out of the standard tsc build graph so it needs no
  // Rust toolchain. They must NOT be in tsconfig.build.json references; `build:wasm`
  // builds and type-checks them via their own tsconfig.
  if (pkg.scripts?.wasm) {
    check(errors, `${dirName} excluded from tsconfig.build.json references`, !buildRefs.has(dirName));
  } else {
    check(errors, `${dirName} in tsconfig.build.json references`, buildRefs.has(dirName));
  }

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

  // --- import → dependency wiring ---

  const srcDir = join(pkgDir, 'src');
  const { source: srcFiles, test: testFiles } = getAllTsFiles(srcDir);
  const sourceImports = scanFlightImports(srcFiles);
  const testImports = scanFlightImports(testFiles);

  const prodDeps = new Set<string>(
    [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})].filter((d) =>
      d.startsWith('@flighthq/'),
    ),
  );
  const allFlightDeps = new Set<string>(Object.keys(allDeps).filter((d) => d.startsWith('@flighthq/')));

  for (const imp of [...sourceImports].sort()) {
    if (imp === name) continue;
    check(errors, `${imp} in dependencies`, prodDeps.has(imp), `source imports ${imp} but it is not in dependencies`);
  }

  for (const imp of [...testImports].sort()) {
    if (imp === name || sourceImports.has(imp)) continue;
    check(
      errors,
      `${imp} in devDependencies`,
      allFlightDeps.has(imp),
      `test imports ${imp} but it is not in any dependency field`,
    );
  }

  // --- dependency ↔ tsconfig reference sync ---

  const pkgTsConfig = readJson<PackageTsConfig>(join(pkgDir, 'tsconfig.json'));
  const tsconfigRefs = new Set((pkgTsConfig?.references ?? []).map((r) => r.path.replace(/^\.\.\//, '')));

  for (const dep of [...allFlightDeps].sort()) {
    const depName = dep.replace('@flighthq/', '');
    check(
      errors,
      `tsconfig references ${depName}`,
      tsconfigRefs.has(depName),
      `${dep} is a dependency but ../${depName} is not in tsconfig.json references`,
    );
  }

  for (const ref of [...tsconfigRefs].sort()) {
    const dep = `@flighthq/${ref}`;
    check(
      errors,
      `${dep} backs tsconfig reference`,
      allFlightDeps.has(dep),
      `tsconfig.json references ../${ref} but ${dep} is not a dependency`,
    );
  }

  results.push({ name, errors });
}

// --- check @flighthq/sdk barrel sync ---
//
// Every app-facing @flighthq/* package must appear as:
//   1. an `export *` line in packages/sdk/src/index.ts
//   2. a "*" dependency entry in packages/sdk/package.json
// Packages excluded by isSdkBarrelExcludedPackage must NOT appear in either place.
// This check runs as part of `npm run packages:check` so barrel drift is caught
// without needing a separate script invocation.

interface BarrelSyncError {
  label: string;
  detail?: string;
}

function checkSdkBarrelSync(): BarrelSyncError[] {
  const errors: BarrelSyncError[] = [];
  const sdkDir = join(packagesDir, 'sdk');
  const barrelPath = join(sdkDir, 'src', 'index.ts');
  const sdkManifestPath = join(sdkDir, 'package.json');

  if (!existsSync(barrelPath) || !existsSync(sdkManifestPath)) return errors;

  // Collect app-facing package names from the already-discovered packageDirs
  const appFacingNames = new Set<string>();
  for (const pkgDir of packageDirs) {
    const pkg = readJson<PackageJson>(join(pkgDir, 'package.json'));
    if (pkg?.name?.startsWith('@flighthq/') && !isSdkBarrelExcludedPackage(pkg.name)) {
      appFacingNames.add(pkg.name);
    }
  }

  // Parse barrel export lines
  const barrelSource = readFileSync(barrelPath, 'utf-8');
  const barrelExports = new Set<string>();
  for (const line of barrelSource.split('\n')) {
    const match = /^export \* from '(@flighthq\/[^']+)';/.exec(line.trim());
    if (match) barrelExports.add(match[1]);
  }

  // Parse barrel dependency entries
  const sdkManifest = readJson<PackageJson>(sdkManifestPath);
  const barrelDeps = new Set(Object.keys(sdkManifest?.dependencies ?? {}).filter((k) => k.startsWith('@flighthq/')));

  // App-facing packages missing from the barrel
  for (const name of [...appFacingNames].sort()) {
    if (!barrelExports.has(name)) {
      errors.push({
        label: `@flighthq/sdk barrel missing export for ${name}`,
        detail: `add "export * from '${name}';" to packages/sdk/src/index.ts`,
      });
    }
    if (!barrelDeps.has(name)) {
      errors.push({
        label: `@flighthq/sdk barrel missing dependency for ${name}`,
        detail: `add "${name}": "*" to packages/sdk/package.json dependencies`,
      });
    }
  }

  // Barrel entries pointing to non-existent or excluded packages
  for (const name of [...barrelExports].sort()) {
    if (isSdkBarrelExcludedPackage(name)) {
      errors.push({
        label: `@flighthq/sdk barrel must not export excluded package ${name}`,
        detail: `remove "export * from '${name}';" from packages/sdk/src/index.ts`,
      });
    } else if (!appFacingNames.has(name)) {
      errors.push({
        label: `@flighthq/sdk barrel exports unknown package ${name}`,
        detail: `no workspace package with this name — remove the export or add the package`,
      });
    }
  }
  for (const name of [...barrelDeps].sort()) {
    if (isSdkBarrelExcludedPackage(name)) {
      errors.push({
        label: `@flighthq/sdk barrel must not depend on excluded package ${name}`,
        detail: `remove "${name}": "*" from packages/sdk/package.json dependencies`,
      });
    } else if (!appFacingNames.has(name)) {
      errors.push({
        label: `@flighthq/sdk barrel depends on unknown package ${name}`,
        detail: `no workspace package with this name — remove the dependency or add the package`,
      });
    }
  }

  return errors;
}

const barrelSyncErrors = checkSdkBarrelSync();

// --- check each example ---

const examplesDir = join(root, 'examples');

const exampleDirs = readdirSync(examplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => join(examplesDir, e.name));

const exampleResults: PackageResult[] = [];

for (const exampleDir of exampleDirs) {
  const pkg = readJson<ExamplePackageJson>(join(exampleDir, 'package.json'));

  if (!pkg?.name) continue;

  const name = pkg.name;
  const errors: CheckError[] = [];

  check(errors, 'private is true', pkg.private === true, `got ${JSON.stringify(pkg.private)}`);
  check(errors, 'type is "module"', pkg.type === 'module', `got ${JSON.stringify(pkg.type)}`);

  for (const rel of ['tsconfig.json', 'vite.config.ts', 'index.html', 'src/app.ts']) {
    check(errors, `${rel} exists`, existsSync(join(exampleDir, rel)));
  }

  check(errors, 'dev script exists', typeof pkg.scripts?.dev === 'string');
  check(errors, 'build script exists', typeof pkg.scripts?.build === 'string');

  for (const [dep, version] of Object.entries(pkg.dependencies ?? {})) {
    if (dep.startsWith('@flighthq/')) {
      check(errors, `${dep} uses "*"`, version === '*', `got "${version}"`);
    }
  }

  const tsconfigPath = join(exampleDir, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    const exampleTsConfig = readJson<ExampleTsConfig>(tsconfigPath);

    check(
      errors,
      'tsconfig.json extends base',
      exampleTsConfig?.extends === '../../tsconfig.base.json',
      `got ${JSON.stringify(exampleTsConfig?.extends)}`,
    );

    const refs = new Set((exampleTsConfig?.references ?? []).map((r) => r.path));
    const flightDeps = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@flighthq/'));

    for (const dep of flightDeps) {
      const pkgName = dep.replace('@flighthq/', '');
      const expectedRef = `../../packages/${pkgName}`;
      check(errors, `tsconfig.json references ${pkgName}`, refs.has(expectedRef));
    }
  }

  exampleResults.push({ name, errors });
}

// --- report ---

const jsonMode = process.argv.includes('--json');

const failedPackages = results.filter((r) => r.errors.length > 0);
const packageErrors = failedPackages.reduce((n, r) => n + r.errors.length, 0);

const failedExamples = exampleResults.filter((r) => r.errors.length > 0);
const exampleErrors = failedExamples.reduce((n, r) => n + r.errors.length, 0);

const totalErrors = packageErrors + exampleErrors + barrelSyncErrors.length;

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        passed: totalErrors === 0,
        packages: results.map((r) => ({ name: r.name, errors: r.errors })),
        examples: exampleResults.map((r) => ({ name: r.name, errors: r.errors })),
        barrelSync: { errors: barrelSyncErrors },
      },
      null,
      2,
    ),
  );
  process.exit(totalErrors === 0 ? 0 : 1);
}

for (const { name, errors } of failedPackages) {
  console.log(`\n${pc.bold(name)}`);
  for (const { label, detail } of errors) {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
}

for (const { name, errors } of failedExamples) {
  console.log(`\n${pc.bold(name)}`);
  for (const { label, detail } of errors) {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
}

if (barrelSyncErrors.length > 0) {
  console.log(`\n${pc.bold('@flighthq/sdk barrel sync')}`);
  for (const { label, detail } of barrelSyncErrors) {
    console.log(`  ${pc.red('✗')} ${label}${detail ? pc.dim(` — ${detail}`) : ''}`);
  }
}

if (totalErrors === 0) {
  console.log(pc.green(`✓ ${results.length} packages and ${exampleResults.length} examples valid`));
  process.exit(0);
} else {
  console.log('');
  const parts: string[] = [];
  if (packageErrors > 0)
    parts.push(
      `${packageErrors} error${packageErrors === 1 ? '' : 's'} across ${failedPackages.length} package${failedPackages.length === 1 ? '' : 's'}`,
    );
  if (exampleErrors > 0)
    parts.push(
      `${exampleErrors} error${exampleErrors === 1 ? '' : 's'} across ${failedExamples.length} example${failedExamples.length === 1 ? '' : 's'}`,
    );
  if (barrelSyncErrors.length > 0)
    parts.push(`${barrelSyncErrors.length} barrel sync error${barrelSyncErrors.length === 1 ? '' : 's'}`);
  console.log(pc.red(`✗ ${parts.join(', ')}`));
  process.exit(1);
}
