import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DependencySource } from './generate-rust-package-exports.ts';
import {
  collectCompanionFileNames,
  compilerAliasArguments,
  collectExportSymbols,
  collectFlightDependencyCrates,
  collectRustExportNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  hasGeneratedProvenanceHeader,
  renderCompanionContractExports,
  renderGeneratedImports,
  dependencyAliasArguments,
  mergeRustExportNames,
  renderPublicExports,
  resolveRustExportName,
  snakeToLowerCamel,
} from './generate-rust-package-exports.ts';

interface Options {
  check: boolean;
  crateName: string;
  packageName: string;
}

type SourceMode = 'generate' | 'rust-only' | 'target-native';

interface PackageModule {
  directPublicExports?: boolean;
  fileName: string;
  mode: SourceMode;
  rustSource: string;
  typescript: string;
}

interface SymbolOwner {
  fileName: string;
  hasType: boolean;
  hasValue: boolean;
  isClass?: boolean;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseOptions(process.argv.slice(2));
const crateRoot = join(repositoryRoot, 'crates', options.crateName);
const packageRoot = join(repositoryRoot, 'packages', options.packageName);
const packageSourceRoot = join(packageRoot, 'src');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);

execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

// Stage under packages/<name>/src so the repository orderer applies the same package-source rules
// as it does to the destination. A system-temp staging path is outside order.ts's repository walk,
// which made its --fix pass a silent no-op and let generated imports diverge from the order gate.
const stagingRoot = mkdtempSync(join(repositoryRoot, 'packages', '.flight-generate-'));
const stagingSourceRoot = join(stagingRoot, 'src');
const rawRoot = join(stagingRoot, 'raw');
mkdirSync(stagingSourceRoot, { recursive: true });
mkdirSync(rawRoot, { recursive: true });

try {
  const rustSources = sourceFiles(crateRoot);
  const aliasSources = rustSources
    .map((rustSource) => join(crateRoot, 'src', rustSource))
    .filter((rustPath) => sourceMode(rustPath) === 'generate');
  const modules = rustSources
    .map((rustSource) => loadModule(rustSource, aliasSources))
    .filter((module): module is PackageModule => module !== null);
  const companions = loadCompanions(modules);
  const symbolModules = [...modules, ...companions];
  const symbols = collectExportSymbols(symbolModules);
  const generatedFiles: string[] = [];

  for (const module of modules) {
    if (module.mode !== 'generate') continue;
    const imports = crateImports(
      join(crateRoot, 'src', module.rustSource),
      module.fileName,
      module.typescript,
      symbols,
    );
    writeGenerated(
      join(stagingSourceRoot, module.fileName),
      imports + module.typescript,
      join(crateRoot, 'src', module.rustSource),
    );
    generatedFiles.push(module.fileName);
  }

  for (const rustTest of testFiles(crateRoot)) {
    const rustPath = join(crateRoot, 'tests', rustTest);
    const fileName = `${snakeToLowerCamel(rustTest.slice(0, -8))}.test.ts`;
    const mode = sourceMode(rustPath);
    if (mode === 'rust-only') continue;
    if (mode === 'target-native') {
      requireTargetNative(fileName, rustPath);
      continue;
    }
    const compilePath = testSourceWithSupport(rustPath, join(rawRoot, `${rustTest}.source.rs`));
    let typescript = compile(
      'generate-tests',
      compilePath,
      join(rawRoot, fileName),
      ['./contract.ts', '--contract-source', join(crateRoot, 'src', 'contract.rs')],
      aliasSources,
    );
    if (typescript.includes('crate.')) {
      typescript = addRustTestSupportImport(typescript);
    }
    writeGenerated(join(stagingSourceRoot, fileName), typescript, rustPath);
    generatedFiles.push(fileName);
  }

  writeGenerated(
    join(stagingSourceRoot, 'contract.ts'),
    contractExports(crateRoot, modules, symbolModules, symbols),
    join(crateRoot, 'src', 'lib.rs'),
  );
  writeGenerated(
    join(stagingSourceRoot, 'index.ts'),
    publicExports(crateRoot, modules, symbolModules, symbols),
    join(crateRoot, 'src', 'lib.rs'),
  );
  generatedFiles.push('contract.ts', 'index.ts');

  execFileSync(formatterPath(), ['--write', stagingSourceRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  execFileSync(tsxPath(), [join(repositoryRoot, 'scripts', 'order.ts'), '--fix', stagingSourceRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  execFileSync(formatterPath(), ['--write', stagingSourceRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });

  finishGeneration(generatedFiles);
} finally {
  rmSync(stagingRoot, { force: true, recursive: true });
}

function addRustTestSupportImport(typescript: string): string {
  const importLine = "import { rustTestSupport as crate } from './rustTestSupport.ts';\n";
  const contractImportEnd = /\} from ["']\.\/contract\.ts["'];\n/;
  if (contractImportEnd.test(typescript)) {
    return typescript.replace(contractImportEnd, (match) => `${match}${importLine}`);
  }
  const vitestImportEnd = /import \{ describe, expect, it \} from ["']vitest["'];\n/;
  return typescript.replace(vitestImportEnd, (match) => `${match}\n${importLine}`);
}

function compile(
  command: string,
  source: string,
  out: string,
  trailing: string[] = [],
  aliasSources: string[] = [],
): string {
  execFileSync(
    compilerPath,
    [
      command,
      '--source',
      source,
      '--out',
      out,
      ...entityArguments(command),
      ...compilerAliasArguments(command, aliasSources, source),
      ...dependencyAliasArguments(dependencySources(command)),
      ...contractArguments(command, trailing),
    ],
    {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  return readFileSync(out, 'utf8');
}

function contractArguments(command: string, trailing: string[]): string[] {
  if (command !== 'generate-tests') return trailing;
  return ['--contract-module', ...trailing];
}

function contractExports(
  crateRoot: string,
  modules: PackageModule[],
  symbolModules: PackageModule[],
  symbols: Map<string, SymbolOwner>,
): string {
  const contractPath = join(crateRoot, 'src', 'contract.rs');
  if (!existsSync(contractPath)) {
    throw new Error(`${relative(repositoryRoot, contractPath)} is required to derive contract exports`);
  }
  const contractUses = collectRustPublicUses(readFileSync(contractPath, 'utf8'));

  let output = '';
  for (const module of modules) {
    const rustModule = module.rustSource.slice(0, -3);
    const moduleUses = contractUses.filter((rustUse) => rustUse.moduleName === rustModule);
    if (moduleUses.length === 0) continue;
    const overrides = sourceDirective(crateRoot, module, 'contract');
    const names =
      overrides.length > 0
        ? overrides
        : moduleUses.some((rustUse) => rustUse.wildcard)
          ? [...symbols.entries()].filter(([, owner]) => owner.fileName === module.fileName).map(([name]) => name)
          : moduleUses.map((rustUse) =>
              resolveRustExportName(rustUse.name ?? '', symbols, moduleExportNames(module), module.fileName),
            );
    const types: string[] = [];
    const values: string[] = [];
    for (const name of [...new Set(names)].sort()) {
      const owner = symbols.get(name);
      if (!owner || owner.fileName !== module.fileName) {
        throw new Error(`contract export ${name} is not owned by ${module.fileName}`);
      }
      (owner.hasValue ? values : types).push(name);
    }
    if (values.length > 0) {
      output += `export { ${values.join(', ')} } from './${module.fileName}';\n`;
    }
    if (types.length > 0) {
      output += `export type { ${types.join(', ')} } from './${module.fileName}';\n`;
    }
  }
  return output + renderCompanionContractExports(symbolModules, symbols);
}

function crateImports(
  rustPath: string,
  outputFileName: string,
  typescript: string,
  symbols: Map<string, SymbolOwner>,
): string {
  const rust = readFileSync(rustPath, 'utf8');
  return renderGeneratedImports(rust, typescript, outputFileName, symbols);
}

// Sources of this crate's `flight-*` dependencies that carry `export-name` directives, with their
// contract modules, so imports of mapped dependency items use the owner's TypeScript names. Tests also
// see dev-dependencies.
function dependencySources(command: string): DependencySource[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  const manifest = readFileSync(join(crateRoot, 'Cargo.toml'), 'utf8');
  const sources: DependencySource[] = [];
  for (const crateName of collectFlightDependencyCrates(manifest, command === 'generate-tests')) {
    if (crateName === options.crateName) continue;
    const sourceRoot = join(repositoryRoot, 'crates', crateName, 'src');
    if (!existsSync(sourceRoot)) continue;
    const module = `@flighthq/${crateName.slice('flight-'.length)}/contract`;
    for (const fileName of readdirSync(sourceRoot)
      .filter((name) => name.endsWith('.rs'))
      .sort()) {
      const path = join(sourceRoot, fileName);
      if (collectRustExportNames(readFileSync(path, 'utf8')).size > 0) sources.push({ module, path });
    }
  }
  return sources;
}

function entityArguments(command: string): string[] {
  if (command !== 'generate') return [];
  const specifier = options.packageName === 'entity' ? './types.ts' : '@flighthq/entity/contract';
  return [
    '--entity-module',
    specifier,
    '--external-alias-source',
    join(repositoryRoot, 'crates', 'flight-entity', 'src', 'types.rs'),
    '--external-alias-module',
    specifier,
  ];
}

function finishGeneration(fileNames: string[]): void {
  const stale: string[] = [];
  const expected = new Set(fileNames);
  const generatedHeader = `// Generated from crates/${options.crateName}/`;
  const existingFiles = existsSync(packageSourceRoot)
    ? new Map(
        readdirSync(packageSourceRoot)
          .filter((fileName) => fileName.endsWith('.ts'))
          .map((fileName) => [fileName, readFileSync(join(packageSourceRoot, fileName), 'utf8')]),
      )
    : new Map<string, string>();
  const staleArtifacts = collectStaleGeneratedFileNames(existingFiles, expected, generatedHeader);
  for (const fileName of fileNames) {
    const stagedPath = join(stagingSourceRoot, fileName);
    const packagePath = join(packageSourceRoot, fileName);
    const contents = readFileSync(stagedPath, 'utf8');
    if (options.check) {
      if (!existsSync(packagePath) || readFileSync(packagePath, 'utf8') !== contents) stale.push(fileName);
    } else {
      writeFileSync(packagePath, contents);
    }
  }
  if (!options.check) {
    for (const fileName of staleArtifacts) rmSync(join(packageSourceRoot, fileName));
  }
  if (staleArtifacts.length > 0 && options.check) {
    stale.push(...staleArtifacts.map((fileName) => `${fileName} (stale artifact)`));
  }
  if (stale.length > 0) {
    throw new Error(`generated output is stale: ${stale.join(', ')}; run npm run generate`);
  }
}

function loadCompanions(modules: PackageModule[]): PackageModule[] {
  const companions: PackageModule[] = [];
  const owners = new Map<string, string>();
  for (const module of modules) {
    const rustPath = join(crateRoot, 'src', module.rustSource);
    const rust = readFileSync(rustPath, 'utf8');
    for (const fileName of collectCompanionFileNames(rust)) {
      if (!/^[A-Za-z0-9_-]+\.ts$/.test(fileName)) {
        throw new Error(`invalid companion ${fileName} declared by ${module.rustSource}`);
      }
      const previousOwner = owners.get(fileName);
      if (previousOwner && previousOwner !== module.rustSource) {
        throw new Error(`companion ${fileName} is declared by both ${previousOwner} and ${module.rustSource}`);
      }
      owners.set(fileName, module.rustSource);
      const path = join(packageSourceRoot, fileName);
      if (!existsSync(path)) {
        throw new Error(`${relative(repositoryRoot, rustPath)} declares missing target-native companion ${fileName}`);
      }
      companions.push({
        directPublicExports: true,
        fileName,
        mode: 'target-native',
        rustSource: module.rustSource,
        typescript: readFileSync(path, 'utf8'),
      });
    }
  }
  return companions;
}

function formatterPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt');
}

function loadModule(rustSource: string, aliasSources: string[]): PackageModule | null {
  const rustPath = join(crateRoot, 'src', rustSource);
  const fileName = `${snakeToLowerCamel(rustSource.slice(0, -3))}.ts`;
  const mode = sourceMode(rustPath);
  if (mode === 'rust-only') return null;
  if (mode === 'target-native') {
    return {
      fileName,
      mode,
      rustSource,
      typescript: requireTargetNative(fileName, rustPath),
    };
  }
  return {
    fileName,
    mode,
    rustSource,
    typescript: compile('generate', rustPath, join(rawRoot, fileName), [], aliasSources),
  };
}

function moduleExportNames(module: PackageModule): Map<string, string> {
  return collectRustExportNames(readFileSync(join(crateRoot, 'src', module.rustSource), 'utf8'));
}

function parseOptions(arguments_: string[]): Options {
  const values = new Map<string, string>();
  let check = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index];
    if (key === '--check') {
      check = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || !value) {
      throw new Error('usage: --crate <crate> --package <package> [--check]');
    }
    values.set(key, value);
    index += 1;
  }
  const crateName = values.get('--crate');
  const packageName = values.get('--package');
  if (!crateName || !packageName || values.size !== 2) {
    throw new Error('usage: --crate <crate> --package <package> [--check]');
  }
  return { check, crateName, packageName };
}

function publicExports(
  crateRoot: string,
  modules: PackageModule[],
  symbolModules: PackageModule[],
  symbols: Map<string, SymbolOwner>,
): string {
  const roots: string[] = [];
  for (const module of modules) {
    roots.push(...sourceDirective(crateRoot, module, 'root'));
  }
  const rust = readFileSync(join(crateRoot, 'src', 'lib.rs'), 'utf8');
  const publicUses = collectRustPublicUses(rust);
  const exportNames = mergeRustExportNames(
    new Map(modules.map((module) => [module.fileName, moduleExportNames(module)])),
  );
  for (const rustUse of publicUses) {
    if (rustUse.name !== undefined) roots.push(resolveRustExportName(rustUse.name, symbols, exportNames));
  }
  if (roots.length === 0) {
    for (const rustUse of publicUses.filter((candidate) => candidate.wildcard)) {
      if (rustUse.moduleName === 'contract') {
        roots.push(...symbols.keys());
        continue;
      }
      const module = modules.find((candidate) => candidate.rustSource === `${rustUse.moduleName}.rs`);
      if (!module) continue;
      roots.push(
        ...[...symbols.entries()].filter(([, owner]) => owner.fileName === module.fileName).map(([name]) => name),
      );
    }
  }
  if (roots.length === 0) {
    throw new Error(`${relative(repositoryRoot, join(crateRoot, 'src', 'lib.rs'))} has no public root exports`);
  }

  return renderPublicExports(symbolModules, symbols, roots);
}

function sourceDirective(crateRoot: string, module: PackageModule, directive: string): string[] {
  const rust = readFileSync(join(crateRoot, 'src', module.rustSource), 'utf8');
  const names: string[] = [];
  const pattern = new RegExp(`^\\/\\/!\\s*flight-compiler:\\s*${directive}\\s+(.+)$`, 'gm');
  for (const match of rust.matchAll(pattern)) {
    names.push(...match[1].split(/[\s,]+/).filter(Boolean));
  }
  return names;
}

function requireTargetNative(fileName: string, rustPath: string): string {
  const path = join(packageSourceRoot, fileName);
  if (!existsSync(path)) {
    throw new Error(`${relative(repositoryRoot, rustPath)} is target-native but ${fileName} does not exist`);
  }
  const contents = readFileSync(path, 'utf8');
  if (hasGeneratedProvenanceHeader(contents)) {
    throw new Error(
      `${relative(repositoryRoot, rustPath)} is target-native but ${fileName} still has a generated provenance header`,
    );
  }
  return contents;
}

function sourceFiles(crateRoot: string): string[] {
  return readdirSync(join(crateRoot, 'src'))
    .filter((fileName) => fileName.endsWith('.rs'))
    .filter((fileName) => !['contract.rs', 'lib.rs', 'sugar.rs'].includes(fileName))
    .sort();
}

function sourceMode(path: string): SourceMode {
  return execFileSync(compilerPath, ['source-mode', '--source', path], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim() as SourceMode;
}

function testFiles(crateRoot: string): string[] {
  return readdirSync(join(crateRoot, 'tests'))
    .filter((fileName) => fileName.endsWith('_test.rs'))
    .sort();
}

function testSourceWithSupport(rustPath: string, out: string): string {
  const source = readFileSync(rustPath, 'utf8');
  if (!/^use crate::common(?:::[^;]+)?;/m.test(source)) return rustPath;

  const supportPath = join(dirname(rustPath), 'common.rs');
  if (!existsSync(supportPath)) {
    throw new Error(`${relative(repositoryRoot, rustPath)} imports crate::common but tests/common.rs is missing`);
  }
  const testSource = source.replace(/^use crate::common(?:::[^;]+)?;\r?\n/gm, '');
  writeFileSync(out, `${readFileSync(supportPath, 'utf8')}\n${testSource}`);
  return out;
}

function tsxPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
}

function writeGenerated(path: string, contents: string, rustSource: string): void {
  const source = relative(repositoryRoot, rustSource).replaceAll('\\', '/');
  writeFileSync(
    path,
    `// Generated from ${source} by flight-compiler.\n// Rust is authoritative; run \`npm run generate\` after changing it.\n\n${contents}`,
  );
}
