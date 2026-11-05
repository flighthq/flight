import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DependencySource,
  ExportSymbolOwner,
  ResolvedExternalContractExports,
} from './generate-rust-package-exports.ts';
import {
  collectCompanionFileNames,
  canonicalizeGeneratedContractImports,
  compilerAliasArguments,
  compilerVisibilityArguments,
  collectTypeScriptExportSymbols,
  collectTypeScriptNullableCallableReturns,
  collectTypeScriptNullableOptionFields,
  collectTypeScriptReferencedTypes,
  collectTypeScriptStringUnions,
  collectCrateExportSymbols,
  collectExportSymbols,
  collectFlightDependencyCrates,
  collectRustExportNames,
  collectRustPublicEnumNames,
  collectRustPublicTypeAliasNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  hasGeneratedProvenanceHeader,
  hasRustConstGroup,
  hasRustGenerationSemantics,
  hasRustPublicRecordDeclaration,
  hasRustPublicTypeAlias,
  hasRustExportNamingSemantics,
  hasRustSiblingGenerationSemantics,
  hasTypeScriptNullableOptionFunctionBoundary,
  hasTypeScriptArrayContractBoundary,
  renderCompanionContractExports,
  resolveExternalContractExports,
  renderGeneratedImports,
  dependencyAliasArguments,
  mergeRustExportNames,
  renderPublicExports,
  renderReferencedConstants,
  renderReferencedExports,
  renderReferencedImports,
  resolveCrateExportSymbols,
  resolveRustExportName,
  snakeToLowerCamel,
  typeScriptDefaultNullOptionParameterArguments,
  typeScriptArrayFieldArguments,
  typeScriptArrayParameterArguments,
  typeScriptArrayReturnArguments,
  typeScriptInlineStringUnionArguments,
  typeScriptInternalTypeExportArguments,
  typeScriptNullableOptionFieldArguments,
  typeScriptNullableOptionParameterArguments,
  typeScriptNullableOptionReturnMetadata,
  typeScriptStringUnionArguments,
  typeScriptStringUnionOwnerImports,
  typeScriptTestContractTypeOwnerArguments,
  typeScriptTestTypeAliasArguments,
  typeScriptTypeAliasArguments,
} from './generate-rust-package-exports.ts';
import { collectPackageSourceFileNames } from './generate-rust-package-sources.ts';

interface Options {
  auditNative: boolean;
  check: boolean;
  crateName: string;
  crateRoot?: string;
  lenient: boolean;
  packageName: string;
  packageRoot?: string;
}

type SourceMode = 'generate' | 'rust-only' | 'target-native';

interface PackageModule {
  generatedTypescript?: string;
  directPublicExports?: boolean;
  fileName: string;
  mode: SourceMode;
  namedRepresentationArguments?: string[];
  nativePublicTypescript?: string;
  nativeTypescript?: string;
  retainedImports?: string;
  rustSource: string;
  typescript: string;
}

interface SymbolOwner {
  fileName: string;
  hasType: boolean;
  hasValue: boolean;
  isClass?: boolean;
}

type ContractSymbol = Omit<ExportSymbolOwner, 'fileName'>;

interface NativeAuditEntry {
  diagnostics: string[];
  kind: 'source' | 'test';
  rustSource: string;
  skipped: number;
  status: 'blocked' | 'compiler-clean' | 'partial';
  typescript: string;
}

interface NativeAuditProbe {
  arrayFieldArguments: string[];
  arrayParameterArguments: string[];
  arrayReturnArguments: string[];
  defaultNullOptionParameterArguments: string[];
  entry: NativeAuditEntry;
  nullableOptionFieldArguments: string[];
  nullableOptionParameterArguments: string[];
  nullableOptionReturnArguments: string[];
  nullableOptionReturnOwners: ReadonlyMap<string, string | null>;
  typeAliasArguments: string[];
}

interface NativeOverlay {
  exports: string;
  imports: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = parseOptions(process.argv.slice(2));
const crateRoot = options.crateRoot ?? join(repositoryRoot, 'crates', options.crateName);
const packageRoot = options.packageRoot ?? join(repositoryRoot, 'packages', options.packageName);
const packageSourceRoot = join(packageRoot, 'src');
const compilerPath = join(
  repositoryRoot,
  'target',
  'debug',
  process.platform === 'win32' ? 'flight-compile.exe' : 'flight-compile',
);
const lenientSkippedByOutput = new Map<string, number>();
const packageTypeScriptArrayFields = new Map<string, { rustSource: string; specification: string }>();
const packageTypeScriptArrayParameters = new Map<string, { rustSource: string; specification: string }>();
const packageTypeScriptArrayReturns = new Map<string, { rustSource: string; specification: string }>();
const packageTypeScriptNullableOptionFields = new Map<string, string>();
const packageTypeScriptDefaultNullOptionParameters = new Map<string, string>();
const packageTypeScriptNullableOptionParameters = new Map<string, string>();
const packageTypeScriptNullableOptionReturns = new Map<string, { owner: string; rustSource: string }>();
const packageTypeScriptTypeAliases = new Map<string, string>();

function mergedTypeScriptArrayParameterArguments(...groups: readonly string[][]): string[] {
  const parameters = new Map<string, string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-array-parameter' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript array parameter compiler arguments');
      }
      const specification = group[index + 1];
      const position = specification.split('=', 1)[0];
      const previous = parameters.get(position);
      if (previous !== undefined && previous !== specification) {
        throw new Error(`TypeScript array parameter ${position} has conflicting representations`);
      }
      parameters.set(position, specification);
    }
  }
  return [...parameters]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => ['--typescript-array-parameter', specification]);
}

function rememberTypeScriptArrayParameterArguments(arguments_: string[], rustSource: string): void {
  const merged = mergedTypeScriptArrayParameterArguments(packageTypeScriptArrayParameterArguments(), arguments_);
  for (let index = 0; index < arguments_.length; index += 2) {
    const specification = arguments_[index + 1];
    const position = specification.split('=', 1)[0];
    const previous = packageTypeScriptArrayParameters.get(position);
    if (previous !== undefined && previous.rustSource !== rustSource) {
      throw new Error(`TypeScript array parameter ${position} has conflicting Rust owners`);
    }
    packageTypeScriptArrayParameters.set(position, { rustSource, specification });
  }
  if (merged.length / 2 !== packageTypeScriptArrayParameters.size) {
    throw new Error('TypeScript array parameter metadata lost its Rust owner');
  }
}

function packageTypeScriptArrayParameterArguments(): string[] {
  return [...packageTypeScriptArrayParameters]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, { specification }]) => ['--typescript-array-parameter', specification]);
}

function mergedTypeScriptArrayPositionArguments(
  flag: '--typescript-array-field' | '--typescript-array-return',
  ...groups: readonly string[][]
): string[] {
  const positions = new Map<string, string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== flag || group[index + 1] === undefined) {
        throw new Error(`invalid ${flag} compiler arguments`);
      }
      const specification = group[index + 1];
      const position = specification.split('=', 1)[0];
      const previous = positions.get(position);
      if (previous !== undefined && previous !== specification) {
        throw new Error(`${flag} ${position} has conflicting representations`);
      }
      positions.set(position, specification);
    }
  }
  return [...positions]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => [flag, specification]);
}

function rememberTypeScriptArrayPositionArguments(
  flag: '--typescript-array-field' | '--typescript-array-return',
  arguments_: string[],
  rustSource: string,
): void {
  const positions = flag === '--typescript-array-field' ? packageTypeScriptArrayFields : packageTypeScriptArrayReturns;
  const existing = packageTypeScriptArrayPositionArguments(flag);
  mergedTypeScriptArrayPositionArguments(flag, existing, arguments_);
  for (let index = 0; index < arguments_.length; index += 2) {
    const specification = arguments_[index + 1];
    const position = specification.split('=', 1)[0];
    const previous = positions.get(position);
    if (previous !== undefined && previous.rustSource !== rustSource) {
      throw new Error(`${flag} ${position} has conflicting Rust owners`);
    }
    positions.set(position, { rustSource, specification });
  }
}

function packageTypeScriptArrayPositionArguments(
  flag: '--typescript-array-field' | '--typescript-array-return',
): string[] {
  const positions = flag === '--typescript-array-field' ? packageTypeScriptArrayFields : packageTypeScriptArrayReturns;
  return [...positions]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, { specification }]) => [flag, specification]);
}

function mergedTypeScriptNullableOptionFieldArguments(...groups: readonly string[][]): string[] {
  const fields = new Map<string, string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-nullable-option-field' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript nullable Option field compiler arguments');
      }
      const specification = group[index + 1];
      const position = specification.slice(specification.lastIndexOf('#') + 1);
      const previous = fields.get(position);
      if (previous !== undefined && previous !== specification) {
        throw new Error(`TypeScript nullable Option field ${position} has conflicting owners`);
      }
      fields.set(position, specification);
    }
  }
  return [...fields]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => ['--typescript-nullable-option-field', specification]);
}

function rememberTypeScriptNullableOptionFieldArguments(arguments_: string[]): void {
  const merged = mergedTypeScriptNullableOptionFieldArguments(
    packageTypeScriptNullableOptionFieldArguments(),
    arguments_,
  );
  packageTypeScriptNullableOptionFields.clear();
  for (let index = 0; index < merged.length; index += 2) {
    const specification = merged[index + 1];
    packageTypeScriptNullableOptionFields.set(specification.slice(specification.lastIndexOf('#') + 1), specification);
  }
}

function packageTypeScriptNullableOptionFieldArguments(): string[] {
  return [...packageTypeScriptNullableOptionFields]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => ['--typescript-nullable-option-field', specification]);
}

function mergedTypeScriptNullableOptionParameterArguments(...groups: readonly string[][]): string[] {
  const parameters = new Set<string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-nullable-option-parameter' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript nullable Option parameter compiler arguments');
      }
      parameters.add(group[index + 1]);
    }
  }
  return [...parameters].sort().flatMap((position) => ['--typescript-nullable-option-parameter', position]);
}

function rememberTypeScriptNullableOptionParameterArguments(arguments_: string[], rustSource: string): void {
  const merged = mergedTypeScriptNullableOptionParameterArguments(
    packageTypeScriptNullableOptionParameterArguments(),
    arguments_,
  );
  const positions = new Set(arguments_.filter((_, index) => index % 2 === 1));
  for (const position of positions) {
    const previous = packageTypeScriptNullableOptionParameters.get(position);
    if (previous !== undefined && previous !== rustSource) {
      throw new Error(`TypeScript nullable Option parameter ${position} has conflicting Rust owners`);
    }
    packageTypeScriptNullableOptionParameters.set(position, rustSource);
  }
  if (merged.length / 2 !== packageTypeScriptNullableOptionParameters.size) {
    throw new Error('TypeScript nullable Option parameter metadata lost its Rust owner');
  }
}

function packageTypeScriptNullableOptionParameterArguments(): string[] {
  return [...packageTypeScriptNullableOptionParameters.keys()]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((position) => ['--typescript-nullable-option-parameter', position]);
}

function mergedTypeScriptDefaultNullOptionParameterArguments(...groups: readonly string[][]): string[] {
  const parameters = new Set<string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-default-null-option-parameter' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript default-null Option parameter compiler arguments');
      }
      parameters.add(group[index + 1]);
    }
  }
  return [...parameters].sort().flatMap((position) => ['--typescript-default-null-option-parameter', position]);
}

function rememberTypeScriptDefaultNullOptionParameterArguments(arguments_: string[], rustSource: string): void {
  const merged = mergedTypeScriptDefaultNullOptionParameterArguments(
    packageTypeScriptDefaultNullOptionParameterArguments(),
    arguments_,
  );
  const positions = new Set(arguments_.filter((_, index) => index % 2 === 1));
  for (const position of positions) {
    const previous = packageTypeScriptDefaultNullOptionParameters.get(position);
    if (previous !== undefined && previous !== rustSource) {
      throw new Error(`TypeScript default-null Option parameter ${position} has conflicting Rust owners`);
    }
    packageTypeScriptDefaultNullOptionParameters.set(position, rustSource);
  }
  if (merged.length / 2 !== packageTypeScriptDefaultNullOptionParameters.size) {
    throw new Error('TypeScript default-null Option parameter metadata lost its Rust owner');
  }
}

function packageTypeScriptDefaultNullOptionParameterArguments(): string[] {
  return [...packageTypeScriptDefaultNullOptionParameters.keys()]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((position) => ['--typescript-default-null-option-parameter', position]);
}

function packageTypeScriptPositionOwnerSources(): string[] {
  return [
    ...new Set([
      ...packageTypeScriptNullableOptionParameters.values(),
      ...packageTypeScriptDefaultNullOptionParameters.values(),
      ...[...packageTypeScriptNullableOptionReturns.values()].map(({ rustSource }) => rustSource),
      ...[...packageTypeScriptArrayFields.values()].map(({ rustSource }) => rustSource),
      ...[...packageTypeScriptArrayParameters.values()].map(({ rustSource }) => rustSource),
      ...[...packageTypeScriptArrayReturns.values()].map(({ rustSource }) => rustSource),
    ]),
  ].sort();
}

function mergedTypeScriptNullableOptionReturnArguments(...groups: readonly string[][]): string[] {
  const returns = new Set<string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-nullable-option-return' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript nullable Option return compiler arguments');
      }
      returns.add(group[index + 1]);
    }
  }
  return [...returns].sort().flatMap((name) => ['--typescript-nullable-option-return', name]);
}

function rememberTypeScriptNullableOptionReturnArguments(
  arguments_: string[],
  rustSource: string,
  canonicalOwners: ReadonlyMap<string, string | null>,
): void {
  const merged = mergedTypeScriptNullableOptionReturnArguments(
    packageTypeScriptNullableOptionReturnArguments(),
    arguments_,
  );
  const names = new Set(arguments_.filter((_, index) => index % 2 === 1));
  for (const name of names) {
    const aliasOwners = crateSourcePaths(join(crateRoot, 'src')).filter((candidate) =>
      collectRustPublicTypeAliasNames(readFileSync(candidate, 'utf8')).includes(name),
    );
    if (aliasOwners.length > 1) {
      throw new Error(`TypeScript nullable Option return ${name} has conflicting Rust callable owners`);
    }
    const canonicalOwner = canonicalOwners.get(name);
    if (!canonicalOwners.has(name)) {
      throw new Error(`TypeScript nullable Option return ${name} lost its canonical owner`);
    }
    const owner = aliasOwners[0] ?? canonicalOwner ?? rustSource;
    const previous = packageTypeScriptNullableOptionReturns.get(name);
    if (previous !== undefined && previous.owner !== owner) {
      throw new Error(`TypeScript nullable Option return ${name} has conflicting Rust owners`);
    }
    if (previous === undefined) packageTypeScriptNullableOptionReturns.set(name, { owner, rustSource });
  }
  if (merged.length / 2 !== packageTypeScriptNullableOptionReturns.size) {
    throw new Error('TypeScript nullable Option return metadata lost its Rust owner');
  }
}

function packageTypeScriptNullableOptionReturnArguments(): string[] {
  return [...packageTypeScriptNullableOptionReturns.keys()]
    .sort()
    .flatMap((name) => ['--typescript-nullable-option-return', name]);
}

function mergedTypeScriptTypeAliasArguments(...groups: readonly string[][]): string[] {
  const aliases = new Map<string, string>();
  for (const group of groups) {
    for (let index = 0; index < group.length; index += 2) {
      if (group[index] !== '--typescript-type-alias' || group[index + 1] === undefined) {
        throw new Error('invalid TypeScript type-alias compiler arguments');
      }
      const specification = group[index + 1];
      const name = specification.split('=', 1)[0];
      const previous = aliases.get(name);
      if (previous !== undefined && previous !== specification) {
        throw new Error(`Rust type alias ${name} has conflicting TypeScript representations`);
      }
      aliases.set(name, specification);
    }
  }
  return [...aliases]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => ['--typescript-type-alias', specification]);
}

function rememberTypeScriptTypeAliasArguments(arguments_: string[]): void {
  const merged = mergedTypeScriptTypeAliasArguments(
    [...packageTypeScriptTypeAliases]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([, specification]) => ['--typescript-type-alias', specification]),
    arguments_,
  );
  packageTypeScriptTypeAliases.clear();
  for (let index = 0; index < merged.length; index += 2) {
    const specification = merged[index + 1];
    packageTypeScriptTypeAliases.set(specification.split('=', 1)[0], specification);
  }
}

function packageTypeScriptTypeAliasArguments(): string[] {
  return [...packageTypeScriptTypeAliases]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, specification]) => ['--typescript-type-alias', specification]);
}

execFileSync('cargo', ['build', '--quiet', '--package', 'flight-compiler'], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});

// Stage in system temp, outside every scanned repository root, so concurrent package scanners and
// working-tree checks never observe a transient directory. Staged sources sit at packages/<name>/src
// relative to the staging root, and order.ts walks that root through `--root`, so the orderer applies
// the same package-source rules as it does to the destination.
const stagingRoot = mkdtempSync(join(tmpdir(), 'flight-generate-'));
const stagingSourceRoot = join(stagingRoot, 'packages', options.packageName, 'src');
const rawRoot = join(stagingRoot, 'raw');
mkdirSync(stagingSourceRoot, { recursive: true });
mkdirSync(rawRoot, { recursive: true });

try {
  const rootRustPath = join(crateRoot, 'src', 'lib.rs');
  const rootMode = sourceMode(rootRustPath);
  const rustSources = sourceFiles(crateRoot);
  const rustSourceModes = rustSources.map((rustSource) => {
    const rustPath = join(crateRoot, 'src', rustSource);
    return { mode: sourceMode(rustPath), rustPath };
  });
  const aliasSources = rustSourceModes
    .filter(
      ({ mode, rustPath }) =>
        mode === 'generate' ||
        (mode === 'target-native' && hasRustSiblingGenerationSemantics(readFileSync(rustPath, 'utf8'))),
    )
    .map(({ rustPath }) => rustPath);
  const targetNativeSources = rustSourceModes
    .filter(({ mode }) => mode === 'target-native')
    .map(({ rustPath }) => rustPath);
  const exportNamingSources = rustSourceModes
    .filter(
      ({ mode, rustPath }) => mode !== 'rust-only' && hasRustExportNamingSemantics(readFileSync(rustPath, 'utf8')),
    )
    .map(({ rustPath }) => rustPath);
  if (options.auditNative) {
    auditNativeSources(rootMode, rustSourceModes, aliasSources, targetNativeSources);
  } else {
    const modules = rustSources
      .map((rustSource) => loadModule(rustSource, aliasSources))
      .filter((module): module is PackageModule => module !== null);
    const needsGeneratedSymbols = rootMode === 'generate' || modules.some((module) => module.mode === 'generate');
    const companions = needsGeneratedSymbols ? loadCompanions(modules) : [];
    const symbolModules = [...modules, ...companions];
    const symbols = needsGeneratedSymbols ? collectExportSymbols(symbolModules) : new Map<string, SymbolOwner>();
    let externalExports: ResolvedExternalContractExports = { output: '', symbols: new Map() };
    if (rootMode === 'generate') {
      const contractUses = collectRustPublicUses(readFileSync(join(crateRoot, 'src', 'contract.rs'), 'utf8'));
      externalExports = resolveExternalContractExports(contractUses, loadExternalContracts(contractUses));
    }
    const publicSymbols = new Map([...symbols, ...externalExports.symbols]);
    // Intra-package imports also resolve crate-internal exports, owner-qualified through each module's Rust
    // paths; the public lanes keep using `symbols`.
    const crateOwners = needsGeneratedSymbols ? collectCrateExportSymbols(symbolModules) : new Map();
    for (let index = 0; index < modules.length; index += 1) {
      const module = modules[index];
      if (module.mode !== 'generate') continue;
      const generatedTypescript = module.generatedTypescript ?? module.typescript;
      const prospectiveImports = crateImports(
        join(crateRoot, 'src', module.rustSource),
        module.fileName,
        (module.retainedImports ?? '') + generatedTypescript,
        new Map([
          ...resolveCrateExportSymbols(
            readFileSync(join(crateRoot, 'src', module.rustSource), 'utf8'),
            module.fileName,
            crateOwners,
          ),
          ...symbols,
        ]),
      );
      const prospectiveTypescript = `${module.retainedImports ?? ''}${prospectiveImports}${generatedTypescript}`;
      const discoveredArguments = typeScriptStringUnionArguments(
        prospectiveTypescript,
        loadImportedContractSymbols(prospectiveTypescript),
      );
      const knownArguments = new Set(module.namedRepresentationArguments ?? []);
      if (discoveredArguments.some((argument) => !knownArguments.has(argument))) {
        modules[index] = loadModule(module.rustSource, aliasSources, prospectiveTypescript) ?? module;
      }
    }
    const generatedFiles: string[] = [];

    for (const module of modules) {
      if (module.mode !== 'generate') continue;
      const generatedTypescript = module.generatedTypescript ?? module.typescript;
      const retainedImports = module.retainedImports ?? '';
      const imports =
        retainedImports +
        crateImports(
          join(crateRoot, 'src', module.rustSource),
          module.fileName,
          retainedImports + generatedTypescript,
          new Map([
            ...resolveCrateExportSymbols(
              readFileSync(join(crateRoot, 'src', module.rustSource), 'utf8'),
              module.fileName,
              crateOwners,
            ),
            ...symbols,
          ]),
        );
      if (module.nativeTypescript === undefined) {
        writeGenerated(
          join(stagingSourceRoot, module.fileName),
          imports + generatedTypescript,
          join(crateRoot, 'src', module.rustSource),
        );
        generatedFiles.push(module.fileName);
        continue;
      }

      const stem = module.fileName.slice(0, -3);
      const generatedFileName = `${stem}.generated.ts`;
      const nativeFileName = `${stem}.native.ts`;
      const overlay = renderNativeOverlay(
        generatedTypescript,
        module.nativeTypescript,
        module.nativePublicTypescript ?? module.nativeTypescript,
        generatedFileName,
        nativeFileName,
      );
      writeGenerated(
        join(stagingSourceRoot, generatedFileName),
        overlay.imports + imports + generatedTypescript,
        join(crateRoot, 'src', module.rustSource),
      );
      writeGenerated(
        join(stagingSourceRoot, module.fileName),
        overlay.exports,
        join(crateRoot, 'src', module.rustSource),
      );
      writeFileSync(join(stagingSourceRoot, nativeFileName), module.nativeTypescript);
      generatedFiles.push(module.fileName, generatedFileName, nativeFileName);
    }

    discoverTargetNativeMetadataForTests(
      testFiles(crateRoot)
        .map((rustTest) => join(crateRoot, 'tests', rustTest))
        .filter((rustPath) => sourceMode(rustPath) === 'generate'),
      rustSourceModes.map(({ rustPath }) => rustPath),
      aliasSources,
      targetNativeSources,
    );

    const crateEnumNames = [
      ...new Set(rustSourceModes.flatMap(({ rustPath }) => collectRustPublicEnumNames(readFileSync(rustPath, 'utf8')))),
    ];
    const packageContractPath = join(packageSourceRoot, 'contract.ts');
    const packageContractSymbols = existsSync(packageContractPath)
      ? collectContractTypeScriptSymbols(packageContractPath)
      : new Map<string, ContractSymbol>();
    const productionTypescript = (existsSync(packageSourceRoot) ? readdirSync(packageSourceRoot) : [])
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .sort()
      .map((name) => readFileSync(join(packageSourceRoot, name), 'utf8'));
    for (const rustTest of testFiles(crateRoot)) {
      const rustPath = join(crateRoot, 'tests', rustTest);
      const fileName = `${snakeToLowerCamel(rustTest.slice(0, -8))}.test.ts`;
      const mode = sourceMode(rustPath);
      if (mode === 'rust-only') continue;
      if (mode === 'target-native') {
        requireTargetNative(fileName, rustPath);
        continue;
      }
      const existingPath = join(packageSourceRoot, fileName);
      const existingTypescript = existsSync(existingPath) ? readFileSync(existingPath, 'utf8') : '';
      const rustTestSource = readFileSync(rustPath, 'utf8');
      const testEnumNames = new Set(crateEnumNames.filter((name) => new RegExp(`\\b${name}::`).test(rustTestSource)));
      const ownerTypescript = `${existingTypescript}\n${typeScriptStringUnionOwnerImports(productionTypescript, testEnumNames)}`;
      const representationArguments = typeScriptStringUnionArguments(
        ownerTypescript,
        loadImportedContractSymbols(ownerTypescript),
      );
      const compilePath = testSourceWithSupport(rustPath, join(rawRoot, `${rustTest}.source.rs`));
      const positionOwners = packageTypeScriptPositionOwnerSources();
      const knownTypeAliasArguments = packageTypeScriptTypeAliasArguments();
      const compileTest = (typeAliasArguments: string[], arrayReturnArguments: string[] = []): string =>
        compile(
          'generate-tests',
          compilePath,
          join(rawRoot, fileName),
          ['./contract.ts', '--contract-source', join(crateRoot, 'src', 'contract.rs')],
          [...new Set([...aliasSources, ...positionOwners, ...exportNamingSources])],
          targetNativeSources.filter(
            (candidate) => !positionOwners.includes(candidate) && !exportNamingSources.includes(candidate),
          ),
          [
            ...testSupportArguments(rustPath),
            ...representationArguments,
            ...typeAliasArguments,
            ...packageTypeScriptArrayPositionArguments('--typescript-array-field'),
            ...packageTypeScriptArrayParameterArguments(),
            ...packageTypeScriptArrayPositionArguments('--typescript-array-return'),
            ...arrayReturnArguments,
            ...packageTypeScriptNullableOptionFieldArguments(),
            ...packageTypeScriptNullableOptionParameterArguments(),
            ...packageTypeScriptDefaultNullOptionParameterArguments(),
            ...packageTypeScriptNullableOptionReturnArguments(),
          ],
        );
      let typescript = compileTest(knownTypeAliasArguments);
      const testTypeAliasArguments = typeScriptTestTypeAliasArguments(
        existingTypescript,
        typescript,
        loadImportedContractSymbols(existingTypescript),
      );
      const contractTypeOwnerArguments = typeScriptTestContractTypeOwnerArguments(
        typescript,
        packageContractSymbols,
        productionTypescript,
        loadImportedContractSymbols(productionTypescript.join('\n')),
      );
      const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(
        knownTypeAliasArguments,
        testTypeAliasArguments,
        contractTypeOwnerArguments,
      );
      if (allTypeAliasArguments.length > knownTypeAliasArguments.length) {
        typescript = compileTest(allTypeAliasArguments);
      }
      const testArrayReturnArguments = typeScriptArrayReturnArguments(existingTypescript, typescript);
      if (testArrayReturnArguments.length > 0) {
        typescript = compileTest(allTypeAliasArguments, testArrayReturnArguments);
      }
      typescript = canonicalizeGeneratedContractImports(existingTypescript, typescript);
      if (typescript.includes('crate.')) {
        typescript = addRustTestSupportImport(typescript);
      }
      writeGenerated(join(stagingSourceRoot, fileName), typescript, rustPath);
      generatedFiles.push(fileName);
    }

    if (rootMode === 'generate') {
      writeGenerated(
        join(stagingSourceRoot, 'contract.ts'),
        contractExports(crateRoot, modules, symbolModules, symbols) + externalExports.output,
        rootRustPath,
      );
      writeGenerated(
        join(stagingSourceRoot, 'index.ts'),
        publicExports(crateRoot, modules, symbolModules, publicSymbols),
        rootRustPath,
      );
      generatedFiles.push('contract.ts', 'index.ts');
    } else if (rootMode === 'target-native') {
      requireTargetNative('contract.ts', rootRustPath);
      requireTargetNative('index.ts', rootRustPath);
    } else {
      throw new Error(`${relative(repositoryRoot, rootRustPath)} cannot be rust-only`);
    }

    if (generatedFiles.length > 0) {
      formatStagedSources();
      execFileSync(
        tsxPath(),
        [join(repositoryRoot, 'scripts', 'order.ts'), '--fix', `--root=${stagingRoot}`, stagingSourceRoot],
        {
          cwd: repositoryRoot,
          stdio: 'inherit',
        },
      );
      formatStagedSources();
    }

    finishGeneration(generatedFiles);
  }
} finally {
  rmSync(stagingRoot, { force: true, recursive: true });
}

function discoverTargetNativeMetadataForTests(
  generatedTests: string[],
  rustSources: string[],
  aliasSources: string[],
  targetNativeSources: string[],
): void {
  if (generatedTests.length === 0 || targetNativeSources.length === 0) return;
  const declaredAliases = new Set(
    rustSources.flatMap((rustPath) => collectRustPublicTypeAliasNames(readFileSync(rustPath, 'utf8'))),
  );
  const testSources = generatedTests.map((rustPath) => readFileSync(rustPath, 'utf8'));
  const requiredAliases = new Set(
    [...declaredAliases].filter((alias) => testSources.some((source) => new RegExp(`\\b${alias}\\b`).test(source))),
  );
  for (const known of packageTypeScriptTypeAliases.keys()) requiredAliases.delete(known);
  for (const rustPath of targetNativeSources) {
    const fileName = `${snakeToLowerCamel(basename(rustPath, '.rs'))}.ts`;
    // A target-native module may expose an established representation for an alias declared by a
    // rust-only sibling. Probe in source order until every alias needed by generated tests has an
    // owner, then keep scanning only modules with other explicit positional boundaries.
    const requiresAliasMetadata = requiredAliases.size > 0;
    const existingPath = join(packageSourceRoot, fileName);
    const hasNullableBoundary =
      existsSync(existingPath) && hasTypeScriptNullableOptionFunctionBoundary(readFileSync(existingPath, 'utf8'));
    const hasArrayBoundary =
      existsSync(existingPath) && hasTypeScriptArrayContractBoundary(readFileSync(existingPath, 'utf8'));
    if (!requiresAliasMetadata && !hasNullableBoundary && !hasArrayBoundary) continue;
    const probe = probeNativeSource(
      'generate',
      rustPath,
      fileName,
      [],
      aliasSources,
      targetNativeSources.filter((candidate) => candidate !== rustPath),
    );
    if (requiresAliasMetadata) rememberTypeScriptTypeAliasArguments(probe.typeAliasArguments);
    rememberTypeScriptArrayPositionArguments('--typescript-array-field', probe.arrayFieldArguments, rustPath);
    rememberTypeScriptArrayParameterArguments(probe.arrayParameterArguments, rustPath);
    rememberTypeScriptArrayPositionArguments('--typescript-array-return', probe.arrayReturnArguments, rustPath);
    rememberTypeScriptNullableOptionFieldArguments(probe.nullableOptionFieldArguments);
    rememberTypeScriptNullableOptionParameterArguments(probe.nullableOptionParameterArguments, rustPath);
    rememberTypeScriptDefaultNullOptionParameterArguments(probe.defaultNullOptionParameterArguments, rustPath);
    rememberTypeScriptNullableOptionReturnArguments(
      probe.nullableOptionReturnArguments,
      rustPath,
      probe.nullableOptionReturnOwners,
    );
    for (const known of packageTypeScriptTypeAliases.keys()) requiredAliases.delete(known);
  }
}

function auditNativeSources(
  rootMode: SourceMode,
  rustSources: readonly { mode: SourceMode; rustPath: string }[],
  aliasSources: string[],
  targetNativeSources: string[],
): void {
  const entries: NativeAuditEntry[] = [];
  for (const { mode, rustPath } of rustSources) {
    if (mode !== 'target-native') continue;
    const fileName = `${snakeToLowerCamel(basename(rustPath, '.rs'))}.ts`;
    const probe = probeNativeSource(
      'generate',
      rustPath,
      fileName,
      [],
      aliasSources,
      targetNativeSources.filter((candidate) => candidate !== rustPath),
    );
    entries.push(probe.entry);
    rememberTypeScriptTypeAliasArguments(probe.typeAliasArguments);
    rememberTypeScriptArrayPositionArguments('--typescript-array-field', probe.arrayFieldArguments, rustPath);
    rememberTypeScriptArrayParameterArguments(probe.arrayParameterArguments, rustPath);
    rememberTypeScriptArrayPositionArguments('--typescript-array-return', probe.arrayReturnArguments, rustPath);
    rememberTypeScriptNullableOptionFieldArguments(probe.nullableOptionFieldArguments);
    rememberTypeScriptNullableOptionParameterArguments(probe.nullableOptionParameterArguments, rustPath);
    rememberTypeScriptDefaultNullOptionParameterArguments(probe.defaultNullOptionParameterArguments, rustPath);
    rememberTypeScriptNullableOptionReturnArguments(
      probe.nullableOptionReturnArguments,
      rustPath,
      probe.nullableOptionReturnOwners,
    );
  }
  for (const rustTest of testFiles(crateRoot)) {
    const rustPath = join(crateRoot, 'tests', rustTest);
    if (sourceMode(rustPath) !== 'target-native') continue;
    const fileName = `${snakeToLowerCamel(rustTest.slice(0, -8))}.test.ts`;
    const compilePath = testSourceWithSupport(rustPath, join(rawRoot, `${rustTest}.audit.rs`));
    const positionOwners = packageTypeScriptPositionOwnerSources();
    const probe = probeNativeSource(
      'generate-tests',
      compilePath,
      fileName,
      ['./contract.ts', '--contract-source', join(crateRoot, 'src', 'contract.rs')],
      [...new Set([...aliasSources, ...positionOwners])],
      targetNativeSources.filter((candidate) => candidate !== rustPath && !positionOwners.includes(candidate)),
      rustPath,
      packageTypeScriptTypeAliasArguments(),
      packageTypeScriptArrayParameterArguments(),
      packageTypeScriptNullableOptionFieldArguments(),
      packageTypeScriptNullableOptionParameterArguments(),
      packageTypeScriptDefaultNullOptionParameterArguments(),
      packageTypeScriptNullableOptionReturnArguments(),
    );
    entries.push(probe.entry);
  }
  const summary = {
    blocked: entries.filter((entry) => entry.status === 'blocked').length,
    compilerClean: entries.filter((entry) => entry.status === 'compiler-clean').length,
    partial: entries.filter((entry) => entry.status === 'partial').length,
    targetNative: entries.length,
  };
  console.log(
    JSON.stringify(
      {
        crate: options.crateName,
        entries,
        package: options.packageName,
        rootMode,
        summary,
      },
      null,
      2,
    ),
  );
}

function probeNativeSource(
  command: 'generate' | 'generate-tests',
  source: string,
  fileName: string,
  trailing: string[],
  aliasSources: string[],
  targetNativeSources: string[],
  reportedSource = source,
  knownTypeAliasArguments: string[] = [],
  knownArrayParameterArguments: string[] = [],
  knownNullableOptionFieldArguments: string[] = [],
  knownNullableOptionParameterArguments: string[] = [],
  knownDefaultNullOptionParameterArguments: string[] = [],
  knownNullableOptionReturnArguments: string[] = [],
): NativeAuditProbe {
  const out = join(rawRoot, `${fileName}.audit.ts`);
  const existingPath = join(packageSourceRoot, fileName);
  const existingTypescript = existsSync(existingPath) ? readFileSync(existingPath, 'utf8') : '';
  const internalTypeExports =
    command === 'generate'
      ? typeScriptInternalTypeExportArguments(
          existingTypescript,
          readFileSync(reportedSource, 'utf8'),
          basename(reportedSource, '.rs'),
          aliasSources
            .filter((candidate) => candidate !== reportedSource)
            .map((candidate) => readFileSync(candidate, 'utf8')),
        )
      : { inlineStringUnionArguments: [], typeAliasArguments: [], typeExportArguments: [] };
  const namedRepresentationArguments = [
    ...typeScriptStringUnionArguments(existingTypescript, loadImportedContractSymbols(existingTypescript)),
    ...internalTypeExports.inlineStringUnionArguments,
    ...internalTypeExports.typeExportArguments,
  ];
  const initialTypeAliasArguments = mergedTypeScriptTypeAliasArguments(
    knownTypeAliasArguments,
    internalTypeExports.typeAliasArguments,
  );
  const compilerArguments = (
    typeAliasArguments: string[],
    arrayParameterArguments: string[],
    nullableOptionFieldArguments: string[],
    nullableOptionParameterArguments: string[],
    defaultNullOptionParameterArguments: string[],
    nullableOptionReturnArguments: string[],
    arrayFieldArguments: string[] = [],
    arrayReturnArguments: string[] = [],
  ): string[] => [
    command,
    '--source',
    source,
    '--out',
    out,
    '--probe-target-native',
    ...entityArguments(command, source),
    ...(command === 'generate' ? ['--lenient'] : []),
    ...namedRepresentationArguments,
    ...(command === 'generate-tests' ? testSupportArguments(reportedSource) : []),
    ...typeAliasArguments,
    ...arrayParameterArguments,
    ...arrayFieldArguments,
    ...arrayReturnArguments,
    ...nullableOptionFieldArguments,
    ...nullableOptionParameterArguments,
    ...defaultNullOptionParameterArguments,
    ...nullableOptionReturnArguments,
    ...compilerAliasArguments(command, aliasSources, source),
    ...compilerVisibilityArguments(
      command,
      crateSourcePaths(join(crateRoot, 'src')),
      aliasSources,
      source,
      targetNativeSources,
    ),
    ...dependencyAliasArguments(dependencySources(command)),
    ...dependencyVisibilityArguments(command),
    ...contractArguments(command, trailing),
  ];
  let result = spawnSync(
    compilerPath,
    compilerArguments(
      initialTypeAliasArguments,
      knownArrayParameterArguments,
      knownNullableOptionFieldArguments,
      knownNullableOptionParameterArguments,
      knownDefaultNullOptionParameterArguments,
      knownNullableOptionReturnArguments,
    ),
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
    },
  );
  let typeAliasArguments: string[] = internalTypeExports.typeAliasArguments;
  let arrayFieldArguments: string[] = [];
  let arrayParameterArguments: string[] = [];
  let arrayReturnArguments: string[] = [];
  let nullableOptionFieldArguments: string[] = [];
  let nullableOptionParameterArguments: string[] = [];
  let defaultNullOptionParameterArguments: string[] = [];
  let nullableOptionReturnArguments: string[] = [];
  let nullableOptionReturnOwners = new Map<string, string | null>();
  if (result.status === 0 && command === 'generate-tests') {
    typeAliasArguments = typeScriptTestTypeAliasArguments(
      existingTypescript,
      readFileSync(out, 'utf8'),
      loadImportedContractSymbols(existingTypescript),
    );
    if (typeAliasArguments.length > 0) {
      result = spawnSync(
        compilerPath,
        compilerArguments(
          mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments),
          knownArrayParameterArguments,
          knownNullableOptionFieldArguments,
          knownNullableOptionParameterArguments,
          knownDefaultNullOptionParameterArguments,
          knownNullableOptionReturnArguments,
        ),
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
        },
      );
    }
  }
  if (result.status === 0 && command === 'generate') {
    typeAliasArguments = mergedTypeScriptTypeAliasArguments(
      internalTypeExports.typeAliasArguments,
      typeScriptTypeAliasArguments(
        existingTypescript,
        readFileSync(out, 'utf8'),
        loadImportedContractSymbols(existingTypescript),
      ),
    );
    if (typeAliasArguments.length > internalTypeExports.typeAliasArguments.length) {
      const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments);
      result = spawnSync(
        compilerPath,
        compilerArguments(
          allTypeAliasArguments,
          knownArrayParameterArguments,
          knownNullableOptionFieldArguments,
          knownNullableOptionParameterArguments,
          knownDefaultNullOptionParameterArguments,
          knownNullableOptionReturnArguments,
        ),
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
        },
      );
    }
    if (result.status === 0) {
      nullableOptionFieldArguments = typeScriptNullableOptionFieldArguments(
        existingTypescript,
        readFileSync(out, 'utf8'),
        loadImportedContractSymbols(existingTypescript),
      );
      if (nullableOptionFieldArguments.length > 0) {
        const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments);
        const allNullableOptionFieldArguments = mergedTypeScriptNullableOptionFieldArguments(
          knownNullableOptionFieldArguments,
          nullableOptionFieldArguments,
        );
        result = spawnSync(
          compilerPath,
          compilerArguments(
            allTypeAliasArguments,
            knownArrayParameterArguments,
            allNullableOptionFieldArguments,
            knownNullableOptionParameterArguments,
            knownDefaultNullOptionParameterArguments,
            knownNullableOptionReturnArguments,
          ),
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
          },
        );
      }
    }
    if (result.status === 0) {
      nullableOptionParameterArguments = typeScriptNullableOptionParameterArguments(
        existingTypescript,
        readFileSync(out, 'utf8'),
      );
      if (nullableOptionParameterArguments.length > 0) {
        const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments);
        const allNullableOptionFieldArguments = mergedTypeScriptNullableOptionFieldArguments(
          knownNullableOptionFieldArguments,
          nullableOptionFieldArguments,
        );
        const allNullableOptionParameterArguments = mergedTypeScriptNullableOptionParameterArguments(
          knownNullableOptionParameterArguments,
          nullableOptionParameterArguments,
        );
        result = spawnSync(
          compilerPath,
          compilerArguments(
            allTypeAliasArguments,
            knownArrayParameterArguments,
            allNullableOptionFieldArguments,
            allNullableOptionParameterArguments,
            knownDefaultNullOptionParameterArguments,
            knownNullableOptionReturnArguments,
          ),
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
          },
        );
      }
    }
    if (result.status === 0) {
      defaultNullOptionParameterArguments = typeScriptDefaultNullOptionParameterArguments(
        existingTypescript,
        readFileSync(out, 'utf8'),
      );
      if (defaultNullOptionParameterArguments.length > 0) {
        const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments);
        const allNullableOptionFieldArguments = mergedTypeScriptNullableOptionFieldArguments(
          knownNullableOptionFieldArguments,
          nullableOptionFieldArguments,
        );
        const allNullableOptionParameterArguments = mergedTypeScriptNullableOptionParameterArguments(
          knownNullableOptionParameterArguments,
          nullableOptionParameterArguments,
        );
        const allDefaultNullOptionParameterArguments = mergedTypeScriptDefaultNullOptionParameterArguments(
          knownDefaultNullOptionParameterArguments,
          defaultNullOptionParameterArguments,
        );
        result = spawnSync(
          compilerPath,
          compilerArguments(
            allTypeAliasArguments,
            knownArrayParameterArguments,
            allNullableOptionFieldArguments,
            allNullableOptionParameterArguments,
            allDefaultNullOptionParameterArguments,
            knownNullableOptionReturnArguments,
          ),
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
          },
        );
      }
    }
    if (result.status === 0) {
      const nullableOptionReturnMetadata = typeScriptNullableOptionReturnMetadata(
        existingTypescript,
        readFileSync(out, 'utf8'),
        loadImportedContractSymbols(existingTypescript),
        compilerVisibleRustTypeAliases(command, source),
      );
      nullableOptionReturnArguments = nullableOptionReturnMetadata.arguments;
      nullableOptionReturnOwners = new Map(nullableOptionReturnMetadata.owners);
      if (nullableOptionReturnArguments.length > 0) {
        const allTypeAliasArguments = mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments);
        const allNullableOptionFieldArguments = mergedTypeScriptNullableOptionFieldArguments(
          knownNullableOptionFieldArguments,
          nullableOptionFieldArguments,
        );
        const allNullableOptionParameterArguments = mergedTypeScriptNullableOptionParameterArguments(
          knownNullableOptionParameterArguments,
          nullableOptionParameterArguments,
        );
        const allDefaultNullOptionParameterArguments = mergedTypeScriptDefaultNullOptionParameterArguments(
          knownDefaultNullOptionParameterArguments,
          defaultNullOptionParameterArguments,
        );
        const allNullableOptionReturnArguments = mergedTypeScriptNullableOptionReturnArguments(
          knownNullableOptionReturnArguments,
          nullableOptionReturnArguments,
        );
        result = spawnSync(
          compilerPath,
          compilerArguments(
            allTypeAliasArguments,
            knownArrayParameterArguments,
            allNullableOptionFieldArguments,
            allNullableOptionParameterArguments,
            allDefaultNullOptionParameterArguments,
            allNullableOptionReturnArguments,
          ),
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
          },
        );
      }
    }
    if (result.status === 0) {
      arrayParameterArguments = typeScriptArrayParameterArguments(existingTypescript, readFileSync(out, 'utf8'));
      arrayFieldArguments = typeScriptArrayFieldArguments(existingTypescript, readFileSync(out, 'utf8'));
      arrayReturnArguments = typeScriptArrayReturnArguments(existingTypescript, readFileSync(out, 'utf8'));
      if (arrayParameterArguments.length > 0 || arrayFieldArguments.length > 0 || arrayReturnArguments.length > 0) {
        result = spawnSync(
          compilerPath,
          compilerArguments(
            mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments),
            mergedTypeScriptArrayParameterArguments(knownArrayParameterArguments, arrayParameterArguments),
            mergedTypeScriptNullableOptionFieldArguments(
              knownNullableOptionFieldArguments,
              nullableOptionFieldArguments,
            ),
            mergedTypeScriptNullableOptionParameterArguments(
              knownNullableOptionParameterArguments,
              nullableOptionParameterArguments,
            ),
            mergedTypeScriptDefaultNullOptionParameterArguments(
              knownDefaultNullOptionParameterArguments,
              defaultNullOptionParameterArguments,
            ),
            mergedTypeScriptNullableOptionReturnArguments(
              knownNullableOptionReturnArguments,
              nullableOptionReturnArguments,
            ),
            arrayFieldArguments,
            arrayReturnArguments,
          ),
          {
            cwd: repositoryRoot,
            encoding: 'utf8',
          },
        );
      }
    }
  }
  if (result.status === 0 && command === 'generate-tests') {
    arrayReturnArguments = typeScriptArrayReturnArguments(existingTypescript, readFileSync(out, 'utf8'));
    if (arrayReturnArguments.length > 0) {
      result = spawnSync(
        compilerPath,
        compilerArguments(
          mergedTypeScriptTypeAliasArguments(knownTypeAliasArguments, typeAliasArguments),
          knownArrayParameterArguments,
          knownNullableOptionFieldArguments,
          knownNullableOptionParameterArguments,
          knownDefaultNullOptionParameterArguments,
          knownNullableOptionReturnArguments,
          [],
          arrayReturnArguments,
        ),
        { cwd: repositoryRoot, encoding: 'utf8' },
      );
    }
  }
  const stderr = result.stderr.trim();
  const diagnostics = stderr === '' ? [] : stderr.split(/\r?\n/);
  const skipped = Number(/lenient: (\d+) items skipped/.exec(stderr)?.[1] ?? 0);
  const status = result.status !== 0 ? 'blocked' : skipped === 0 ? 'compiler-clean' : 'partial';
  return {
    arrayFieldArguments,
    arrayParameterArguments,
    arrayReturnArguments,
    defaultNullOptionParameterArguments,
    entry: {
      diagnostics,
      kind: command === 'generate' ? 'source' : 'test',
      rustSource: relative(crateRoot, reportedSource),
      skipped,
      status,
      typescript: fileName,
    },
    nullableOptionFieldArguments,
    nullableOptionParameterArguments,
    nullableOptionReturnArguments,
    nullableOptionReturnOwners,
    typeAliasArguments,
  };
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
  targetNativeSources: string[] = [],
  representationArguments: string[] = [],
): string {
  const arguments_ = [
    command,
    '--source',
    source,
    '--out',
    out,
    ...entityArguments(command, source),
    ...(options.lenient && command === 'generate' ? ['--lenient'] : []),
    ...representationArguments,
    ...compilerAliasArguments(command, aliasSources, source),
    ...compilerVisibilityArguments(
      command,
      crateSourcePaths(join(crateRoot, 'src')),
      aliasSources,
      source,
      targetNativeSources,
    ),
    ...dependencyAliasArguments(dependencySources(command)),
    ...dependencyVisibilityArguments(command),
    ...contractArguments(command, trailing),
  ];
  if (options.lenient && command === 'generate') {
    const result = spawnSync(compilerPath, arguments_, { cwd: repositoryRoot, encoding: 'utf8' });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`flight-compile ${command} failed with exit code ${String(result.status)}`);
    }
    lenientSkippedByOutput.set(out, Number(/lenient: (\d+) items skipped/.exec(result.stderr)?.[1] ?? 0));
  } else {
    execFileSync(compilerPath, arguments_, {
      cwd: repositoryRoot,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
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
    const overrides = sourceDirective(crateRoot, module, 'contract');
    if (moduleUses.length === 0 && overrides.length === 0) continue;
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
  const exports = output + renderCompanionContractExports(symbolModules, symbols);
  return exports === '' ? 'export {};\n' : exports;
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

// Sources of this crate's `flight-*` dependencies that carry `export-name` or `const-group` directives, with their
// contract modules, so imports of mapped dependency items use the owner's TypeScript names. Tests also
// see dev-dependencies.
function dependencySources(command: string): DependencySource[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  const manifest = readFileSync(join(crateRoot, 'Cargo.toml'), 'utf8');
  const sources: DependencySource[] = [];
  for (const crateName of collectFlightDependencyCrates(manifest, command === 'generate-tests')) {
    // The entity type source is already supplied by `entityArguments`; avoid duplicating one
    // external semantic owner under the same contract module.
    if (crateName === options.crateName || crateName === 'flight-entity') continue;
    const sourceRoot = join(repositoryRoot, 'crates', crateName, 'src');
    if (!existsSync(sourceRoot)) continue;
    const module = `@flighthq/${crateName.slice('flight-'.length)}/contract`;
    for (const fileName of readdirSync(sourceRoot)
      .filter((name) => name.endsWith('.rs'))
      .sort()) {
      const path = join(sourceRoot, fileName);
      const rust = readFileSync(path, 'utf8');
      if (
        collectRustExportNames(rust).size > 0 ||
        hasRustConstGroup(rust) ||
        hasRustGenerationSemantics(rust) ||
        hasRustPublicRecordDeclaration(rust) ||
        (hasRustPublicTypeAlias(rust) && !/^\/\/!\s*flight-compiler:\s*(?:rust-only|target-native)\b/m.test(rust))
      ) {
        sources.push({ module, path });
      }
    }
  }
  return sources;
}

// Every non-root, non-rust-only source of this crate's `flight-*` dependencies, as visibility sources, so
// the compiler can resolve entity and field types that cross the crate boundary (an entity field holding a
// dependency's `Ref<Vector3>`, a `.clear()` on a dependency struct's `Vec` field). Tests also see
// dev-dependencies. The entity crate is already supplied by `entityArguments`.
function dependencyVisibilityArguments(command: string): string[] {
  return dependencyVisibilitySources(command).flatMap((path) => ['--visibility-source', path]);
}

function dependencyVisibilitySources(command: string): string[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  const manifest = readFileSync(join(crateRoot, 'Cargo.toml'), 'utf8');
  const sources: string[] = [];
  for (const crateName of collectFlightDependencyCrates(manifest, command === 'generate-tests')) {
    if (crateName === options.crateName || crateName === 'flight-entity') continue;
    const sourceRoot = join(repositoryRoot, 'crates', crateName, 'src');
    if (!existsSync(sourceRoot)) continue;
    for (const path of crateSourcePaths(sourceRoot)) {
      if (['contract.rs', 'lib.rs', 'sugar.rs'].some((name) => path.endsWith(`/${name}`))) continue;
      if (/^\/\/!\s*flight-compiler:\s*rust-only\b/m.test(readFileSync(path, 'utf8'))) continue;
      sources.push(path);
    }
  }
  return sources;
}

function compilerVisibleRustTypeAliases(command: string, source: string): Set<string> {
  const paths = new Set([source, ...crateSourcePaths(join(crateRoot, 'src')), ...dependencyVisibilitySources(command)]);
  return new Set(
    [...paths].flatMap((path) => (existsSync(path) ? collectRustPublicTypeAliasNames(readFileSync(path, 'utf8')) : [])),
  );
}

function entityArguments(command: string, source: string): string[] {
  if (command !== 'generate' && command !== 'generate-tests') return [];
  const specifier = options.packageName === 'entity' ? './types.ts' : '@flighthq/entity/contract';
  const rust = readFileSync(source, 'utf8');
  const bindingSource = join(repositoryRoot, 'crates', 'flight-entity', 'src', 'binding.rs');
  const representationSources = /\bget_entity_binding(?:_as)?\b/.test(rust) ? [bindingSource] : [];
  // Tests take the entity source only as an alias source, so they read its identity aliases
  // (`NonEntityCreateResult<T>` is `T`) when resolving the record a factory returns. Sources that
  // call an entity binding query also take that canonical owner's explicit null representation.
  const entityModule = command === 'generate' ? ['--entity-module', specifier] : [];
  return [
    ...entityModule,
    '--external-alias-source',
    join(repositoryRoot, 'crates', 'flight-entity', 'src', 'types.rs'),
    '--external-alias-module',
    specifier,
    ...representationSources.flatMap((path) => ['--external-alias-source', path, '--external-alias-module', specifier]),
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
  for (const [fileName] of existingFiles) {
    if (!fileName.endsWith('.native.ts') || expected.has(fileName)) continue;
    const generatedFileName = `${fileName.slice(0, -'.native.ts'.length)}.generated.ts`;
    const generated = existingFiles.get(generatedFileName);
    if (generated?.startsWith(generatedHeader)) staleArtifacts.push(fileName);
  }
  staleArtifacts.sort();
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

function loadExternalContracts(contractUses: readonly ReturnType<typeof collectRustPublicUses>[number][]) {
  const contracts = new Map<
    string,
    {
      exportNames: Map<string, string>;
      module: string;
      symbols: Map<string, { hasType: boolean; hasValue: boolean; isClass?: boolean }>;
    }
  >();
  for (const rustModule of [...new Set(contractUses.map((rustUse) => rustUse.moduleName))]
    .filter((name) => name.startsWith('flight_'))
    .sort()) {
    const crateName = rustModule.replaceAll('_', '-');
    const packageName = crateName.slice('flight-'.length);
    const contractPath = join(repositoryRoot, 'packages', packageName, 'src', 'contract.ts');
    if (!existsSync(contractPath)) {
      throw new Error(`${relative(repositoryRoot, contractPath)} is required by external Rust contract ${rustModule}`);
    }
    const sourceRoot = join(repositoryRoot, 'crates', crateName, 'src');
    const exportNames = existsSync(sourceRoot)
      ? mergeRustExportNames(
          new Map(
            readdirSync(sourceRoot)
              .filter((fileName) => fileName.endsWith('.rs'))
              .sort()
              .map((fileName) => [fileName, collectRustExportNames(readFileSync(join(sourceRoot, fileName), 'utf8'))]),
          ),
        )
      : new Map<string, string>();
    contracts.set(rustModule, {
      exportNames,
      module: `@flighthq/${packageName}/contract`,
      symbols: collectContractTypeScriptSymbols(contractPath),
    });
  }
  return contracts;
}

function loadImportedContractSymbols(typescript: string): Map<string, Map<string, ContractSymbol>> {
  const contracts = new Map<string, Map<string, ContractSymbol>>();
  for (const match of typescript.matchAll(/\bfrom\s+['"](@flighthq\/([^/'"]+)\/contract)['"]/g)) {
    const module = match[1];
    if (contracts.has(module)) continue;
    const contractPath = join(repositoryRoot, 'packages', match[2], 'src', 'contract.ts');
    if (!existsSync(contractPath)) {
      throw new Error(
        `${relative(repositoryRoot, contractPath)} is required by imported TypeScript contract ${module}`,
      );
    }
    contracts.set(module, collectContractTypeScriptSymbols(contractPath));
  }
  return contracts;
}

function collectContractTypeScriptSymbols(path: string): Map<string, ContractSymbol> {
  const symbols = new Map<string, ContractSymbol>();
  const visited = new Set<string>();

  function visit(currentPath: string): void {
    if (visited.has(currentPath)) return;
    visited.add(currentPath);
    const typescript = readFileSync(currentPath, 'utf8');
    const stringUnions = collectTypeScriptStringUnions(typescript);
    const nullableCallableReturns = collectTypeScriptNullableCallableReturns(typescript);
    const nullableFields = collectTypeScriptNullableOptionFields(typescript);
    const referencedTypes = collectTypeScriptReferencedTypes(typescript);
    for (const [name, owner] of collectTypeScriptExportSymbols(typescript)) {
      const existing = symbols.get(name) ?? { hasType: false, hasValue: false, isClass: false };
      existing.hasType ||= owner.hasType;
      existing.hasValue ||= owner.hasValue;
      existing.isClass ||= owner.isClass;
      const values = stringUnions.get(name);
      if (values !== undefined) {
        if (
          existing.stringUnionValues !== undefined &&
          JSON.stringify(existing.stringUnionValues) !== JSON.stringify(values)
        ) {
          throw new Error(`TypeScript string union ${name} has conflicting canonical declarations`);
        }
        existing.stringUnionValues = values;
      }
      const fields = nullableFields.get(name);
      if (fields !== undefined) {
        existing.nullableFields = [...new Set([...(existing.nullableFields ?? []), ...fields])].sort();
      }
      existing.nullableCallableReturn ||= nullableCallableReturns.has(name);
      const references = referencedTypes.get(name);
      if (references !== undefined) {
        existing.referencedTypes = [...new Set([...(existing.referencedTypes ?? []), ...references])].sort();
      }
      symbols.set(name, existing);
    }
    for (const match of typescript.matchAll(/^export\s+\*\s+from\s+['"](\.[^'"]+)['"];?/gm)) {
      const specifier = match[1];
      const resolved = resolve(dirname(currentPath), specifier);
      visit(existsSync(resolved) ? resolved : `${resolved}.ts`);
    }
  }

  visit(path);
  return symbols;
}

// The staged tree lives outside the repository, so the formatter is pointed at the repository's
// configuration explicitly rather than discovering it from the staged path.
function formatStagedSources(): void {
  execFileSync(formatterPath(), ['--write', '--config', join(repositoryRoot, '.oxfmtrc.json'), stagingSourceRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
}

function formatterPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt');
}

function loadModule(rustSource: string, aliasSources: string[], representationImports = ''): PackageModule | null {
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
  const outputPath = join(rawRoot, fileName);
  const originalPath = join(packageSourceRoot, fileName);
  const existingTypescript = existsSync(originalPath) ? readFileSync(originalPath, 'utf8') : '';
  const stem = fileName.slice(0, -3);
  const nativePath = join(packageSourceRoot, `${stem}.native.ts`);
  const existingNativeTypescript = existsSync(nativePath) ? readFileSync(nativePath, 'utf8') : undefined;
  const source = relative(repositoryRoot, rustPath).replaceAll('\\', '/');
  const generatedProvenanceHeader = `// Generated from ${source} by flight-compiler.\n// Rust is authoritative; run \`npm run generate\` after changing it.\n`;
  const existingIsGenerated = existingTypescript.startsWith(generatedProvenanceHeader);
  // Once a lenient module has an overlay, its generated public file is only a router. The retained
  // native implementation remains the established TypeScript contract whose imports, signatures,
  // and explicit representation metadata must drive every later generation pass.
  const contractTypescript =
    existingIsGenerated && existingNativeTypescript !== undefined ? existingNativeTypescript : existingTypescript;
  const importedContractSymbols = loadImportedContractSymbols(contractTypescript);
  const representationTypescript = `${contractTypescript}\n${representationImports}`;
  const internalTypeExports = typeScriptInternalTypeExportArguments(
    contractTypescript,
    readFileSync(rustPath, 'utf8'),
    basename(rustPath, '.rs'),
    aliasSources.filter((candidate) => candidate !== rustPath).map((candidate) => readFileSync(candidate, 'utf8')),
  );
  const namedRepresentationArguments = [
    ...typeScriptStringUnionArguments(representationTypescript, loadImportedContractSymbols(representationTypescript)),
    ...internalTypeExports.inlineStringUnionArguments,
    ...internalTypeExports.typeExportArguments,
  ];
  const initialRepresentationArguments = [...namedRepresentationArguments, ...internalTypeExports.typeAliasArguments];
  let compiledTypescript = compile(
    'generate',
    rustPath,
    outputPath,
    [],
    aliasSources,
    [],
    initialRepresentationArguments,
  );
  const typeAliasArguments = mergedTypeScriptTypeAliasArguments(
    internalTypeExports.typeAliasArguments,
    typeScriptTypeAliasArguments(contractTypescript, compiledTypescript, importedContractSymbols),
  );
  const representationArguments = [...namedRepresentationArguments, ...typeAliasArguments];
  if (typeAliasArguments.length > internalTypeExports.typeAliasArguments.length) {
    compiledTypescript = compile('generate', rustPath, outputPath, [], aliasSources, [], representationArguments);
  }
  rememberTypeScriptTypeAliasArguments(typeAliasArguments);
  const arrayFieldArguments = typeScriptArrayFieldArguments(contractTypescript, compiledTypescript);
  const arrayParameterArguments = typeScriptArrayParameterArguments(contractTypescript, compiledTypescript);
  const arrayReturnArguments = typeScriptArrayReturnArguments(contractTypescript, compiledTypescript);
  const arrayRepresentationArguments = [
    ...representationArguments,
    ...arrayFieldArguments,
    ...arrayParameterArguments,
    ...arrayReturnArguments,
  ];
  if (arrayFieldArguments.length > 0 || arrayParameterArguments.length > 0 || arrayReturnArguments.length > 0) {
    compiledTypescript = compile('generate', rustPath, outputPath, [], aliasSources, [], arrayRepresentationArguments);
    rememberTypeScriptArrayPositionArguments('--typescript-array-field', arrayFieldArguments, rustPath);
    rememberTypeScriptArrayParameterArguments(arrayParameterArguments, rustPath);
    rememberTypeScriptArrayPositionArguments('--typescript-array-return', arrayReturnArguments, rustPath);
  }
  const nullableOptionFieldArguments = typeScriptNullableOptionFieldArguments(
    contractTypescript,
    compiledTypescript,
    importedContractSymbols,
  );
  const positionalRepresentationArguments = [...arrayRepresentationArguments, ...nullableOptionFieldArguments];
  if (nullableOptionFieldArguments.length > 0) {
    compiledTypescript = compile(
      'generate',
      rustPath,
      outputPath,
      [],
      aliasSources,
      [],
      positionalRepresentationArguments,
    );
    rememberTypeScriptNullableOptionFieldArguments(nullableOptionFieldArguments);
  }
  const nullableOptionParameterArguments = typeScriptNullableOptionParameterArguments(
    contractTypescript,
    compiledTypescript,
  );
  const parameterRepresentationArguments = [...positionalRepresentationArguments, ...nullableOptionParameterArguments];
  if (nullableOptionParameterArguments.length > 0) {
    compiledTypescript = compile(
      'generate',
      rustPath,
      outputPath,
      [],
      aliasSources,
      [],
      parameterRepresentationArguments,
    );
    rememberTypeScriptNullableOptionParameterArguments(nullableOptionParameterArguments, rustPath);
  }
  const defaultNullOptionParameterArguments = typeScriptDefaultNullOptionParameterArguments(
    contractTypescript,
    compiledTypescript,
  );
  const defaultNullParameterRepresentationArguments = [
    ...parameterRepresentationArguments,
    ...defaultNullOptionParameterArguments,
  ];
  if (defaultNullOptionParameterArguments.length > 0) {
    compiledTypescript = compile(
      'generate',
      rustPath,
      outputPath,
      [],
      aliasSources,
      [],
      defaultNullParameterRepresentationArguments,
    );
    rememberTypeScriptDefaultNullOptionParameterArguments(defaultNullOptionParameterArguments, rustPath);
  }
  const nullableOptionReturnMetadata = typeScriptNullableOptionReturnMetadata(
    contractTypescript,
    compiledTypescript,
    importedContractSymbols,
    compilerVisibleRustTypeAliases('generate', rustPath),
  );
  const nullableOptionReturnArguments = nullableOptionReturnMetadata.arguments;
  const nullableRepresentationArguments = [
    ...defaultNullParameterRepresentationArguments,
    ...nullableOptionReturnArguments,
  ];
  if (nullableOptionReturnArguments.length > 0) {
    compiledTypescript = compile(
      'generate',
      rustPath,
      outputPath,
      [],
      aliasSources,
      [],
      nullableRepresentationArguments,
    );
    rememberTypeScriptNullableOptionReturnArguments(
      nullableOptionReturnArguments,
      rustPath,
      nullableOptionReturnMetadata.owners,
    );
  }
  const inlineRepresentationArguments = typeScriptInlineStringUnionArguments(contractTypescript, compiledTypescript);
  if (inlineRepresentationArguments.length > 0) {
    compiledTypescript = compile(
      'generate',
      rustPath,
      outputPath,
      [],
      aliasSources,
      [],
      [...nullableRepresentationArguments, ...inlineRepresentationArguments],
    );
  }
  const typescript = canonicalizeGeneratedContractImports(contractTypescript, compiledTypescript);
  const retainedConstants = renderReferencedConstants(contractTypescript, typescript);
  const typescriptWithConstants =
    retainedConstants === '' ? typescript : `${typescript.trimEnd()}\n\n${retainedConstants}`.replace(/^\n+/, '');
  const retainedExports = renderReferencedExports(contractTypescript, typescriptWithConstants);
  const generatedTypescript =
    retainedExports === ''
      ? typescriptWithConstants
      : `${typescriptWithConstants.trimEnd()}\n\n${retainedExports}`.replace(/^\n+/, '');
  const retainedImports = renderReferencedImports(contractTypescript, typescriptWithConstants, importedContractSymbols);
  if ((lenientSkippedByOutput.get(outputPath) ?? 0) === 0) {
    return {
      fileName,
      mode,
      namedRepresentationArguments,
      retainedImports,
      rustSource,
      typescript: generatedTypescript,
    };
  }
  const storedNativeTypescript = existingNativeTypescript
    ? existingNativeTypescript
    : existsSync(originalPath) && !existingIsGenerated
      ? readFileSync(originalPath, 'utf8')
      : undefined;
  if (storedNativeTypescript === undefined) {
    throw new Error(
      `${relative(repositoryRoot, rustPath)} needs a native overlay, but ${relative(repositoryRoot, nativePath)} is missing`,
    );
  }
  const nativePublicTypescript = stripExposedNativeFallbacks(storedNativeTypescript, generatedTypescript);
  const nativeTypescript = exposeNativeFallbacks(nativePublicTypescript, generatedTypescript);
  return {
    fileName,
    generatedTypescript,
    mode,
    namedRepresentationArguments,
    nativePublicTypescript,
    nativeTypescript,
    retainedImports,
    rustSource,
    // Symbol ownership is the union of the generated portion and the native fallback portion. The
    // staged public module re-exports that same union from the two implementation files.
    typescript: `${generatedTypescript}\n${nativeTypescript}`,
  };
}

function renderNativeOverlay(
  generatedTypescript: string,
  nativeTypescript: string,
  nativePublicTypescript: string,
  generatedFileName: string,
  nativeFileName: string,
): NativeOverlay {
  const generated = collectTypeScriptExportSymbols(generatedTypescript);
  const native = collectTypeScriptExportSymbols(nativeTypescript);
  const nativePublic = collectTypeScriptExportSymbols(nativePublicTypescript);
  const fallback = new Map([...native].filter(([name]) => !generated.has(name)));
  const publicFallback = new Map([...nativePublic].filter(([name]) => !generated.has(name)));
  if (fallback.size === 0) {
    throw new Error(`lenient generation skipped items, but ${nativeFileName} provides no missing exported symbols`);
  }

  const generatedWithoutDiagnostics = generatedTypescript.replace(/^\/\/ \[lenient\].*$/gm, '');
  const imports = renderSymbolList(
    [...fallback].filter(([name]) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(generatedWithoutDiagnostics)),
    `./${nativeFileName}`,
    'import',
  );
  const exports =
    renderSymbolList([...generated], `./${generatedFileName}`, 'export') +
    renderSymbolList([...publicFallback], `./${nativeFileName}`, 'export');
  return { exports, imports };
}

function exposeNativeFallbacks(nativeTypescript: string, generatedTypescript: string): string {
  const nativeSymbols = collectTypeScriptExportSymbols(nativeTypescript);
  const exportNames = new Set<string>();
  for (const name of lenientFallbackNames(generatedTypescript)) {
    if (nativeSymbols.has(name)) continue;
    if (
      new RegExp(
        `^(?:async\\s+)?function\\s+${escapeRegExp(name)}\\b|^(?:const|let|var)\\s+${escapeRegExp(name)}\\b|^(?:class|enum|interface|type)\\s+${escapeRegExp(name)}\\b`,
        'm',
      ).test(nativeTypescript)
    ) {
      exportNames.add(name);
    }
  }
  if (exportNames.size === 0) return nativeTypescript;
  return `${nativeTypescript.trimEnd()}\n\n// flight-compiler: native fallback exports\nexport { ${[...exportNames].sort().join(', ')} };\n`;
}

function stripExposedNativeFallbacks(nativeTypescript: string, generatedTypescript: string): string {
  const marked = nativeTypescript.replace(
    /\n*\/\/ flight-compiler: native fallback exports\r?\nexport \{[^}]*\};\s*$/,
    '\n',
  );
  if (marked !== nativeTypescript) return marked;

  // Compatibility with the first overlay prototype, before the generated export carried a marker.
  const names = [...lenientFallbackNames(generatedTypescript)].sort().join(', ');
  return names === ''
    ? nativeTypescript
    : nativeTypescript.replace(new RegExp(`\\n+export \\{ ${escapeRegExp(names)} \\};\\s*$`), '\n');
}

function lenientFallbackNames(generatedTypescript: string): Set<string> {
  const names = new Set<string>();
  for (const match of generatedTypescript.matchAll(
    /^\/\/ \[lenient\] (?:enum|fn|static|struct|type) ([A-Za-z_][A-Za-z0-9_]*):/gm,
  )) {
    names.add(snakeToLowerCamel(match[1]));
  }
  return names;
}

function renderSymbolList(
  symbols: [string, { hasType: boolean; hasValue: boolean }][],
  specifier: string,
  kind: 'export' | 'import',
): string {
  const values = symbols
    .filter(([, symbol]) => symbol.hasValue)
    .map(([name]) => name)
    .sort();
  const types = symbols
    .filter(([, symbol]) => symbol.hasType && !symbol.hasValue)
    .map(([name]) => name)
    .sort();
  let output = '';
  if (values.length > 0) output += `${kind} { ${values.join(', ')} } from './${specifier.replace(/^\.\//, '')}';\n`;
  if (types.length > 0) output += `${kind} type { ${types.join(', ')} } from './${specifier.replace(/^\.\//, '')}';\n`;
  return output === '' ? output : `${output}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function moduleExportNames(module: PackageModule): Map<string, string> {
  return collectRustExportNames(readFileSync(join(crateRoot, 'src', module.rustSource), 'utf8'));
}

function parseOptions(arguments_: string[]): Options {
  const values = new Map<string, string>();
  const allowed = new Set(['--crate', '--crate-root', '--package', '--package-root']);
  let auditNative = false;
  let check = false;
  let lenient = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const key = arguments_[index];
    if (key === '--audit-native') {
      auditNative = true;
      continue;
    }
    if (key === '--check') {
      check = true;
      continue;
    }
    if (key === '--lenient') {
      lenient = true;
      continue;
    }
    const value = arguments_[index + 1];
    if (!key || !allowed.has(key) || !value) {
      throw new Error(
        'usage: --crate <crate> --package <package> [--crate-root <path>] [--package-root <path>] [--audit-native] [--check] [--lenient]',
      );
    }
    values.set(key, value);
    index += 1;
  }
  const crateName = values.get('--crate');
  const packageName = values.get('--package');
  if (!crateName || !packageName) {
    throw new Error(
      'usage: --crate <crate> --package <package> [--crate-root <path>] [--package-root <path>] [--audit-native] [--check] [--lenient]',
    );
  }
  return {
    auditNative,
    check,
    crateName,
    crateRoot: values.get('--crate-root'),
    lenient,
    packageName,
    packageRoot: values.get('--package-root'),
  };
}

function publicExports(
  crateRoot: string,
  modules: PackageModule[],
  symbolModules: PackageModule[],
  symbols: Map<string, SymbolOwner>,
): string {
  const exactRoots = [
    ...new Set(modules.flatMap((module) => rootOnlyNames(join(crateRoot, 'src', module.rustSource)))),
  ];
  if (exactRoots.length > 0) return renderPublicExports(symbolModules, symbols, exactRoots);

  // `index.ts` is the curated public-API manifest. Strict promotion replaces implementation files,
  // not that package-level API decision: retain its exact export routes, including compatibility
  // types owned by an auxiliary TypeScript barrel outside the generated symbol set. A root-only
  // directive remains the explicit way for Rust to replace that manifest.
  const indexPath = join(packageSourceRoot, 'index.ts');
  if (existsSync(indexPath)) {
    const existingIndex = readFileSync(indexPath, 'utf8');
    if (collectContractTypeScriptSymbols(indexPath).size > 0) {
      return existingIndex.replace(
        /^\/\/ Generated from [^\r\n]+ by flight-compiler\.\r?\n\/\/ Rust is authoritative; run `npm run generate` after changing it\.\r?\n\r?\n/,
        '',
      );
    }
  }

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
    // A crate with an intentionally empty contract still has a valid public surface. Keep the
    // generated files as explicit ES modules without inventing a root export. A non-empty symbol
    // set with no roots remains an error because that usually means a missing Rust re-export.
    if (symbols.size === 0) return 'export {};\n';
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

// Every Rust source under `root`, nested modules included, as sorted paths.
function crateSourcePaths(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return crateSourcePaths(path);
      return entry.name.endsWith('.rs') ? [path] : [];
    })
    .sort();
}

function sourceFiles(crateRoot: string): string[] {
  const sourceRoot = join(crateRoot, 'src');
  return collectPackageSourceFileNames({
    availableFileNames: readdirSync(sourceRoot).filter((fileName) => fileName.endsWith('.rs')),
    libSource: readFileSync(join(sourceRoot, 'lib.rs'), 'utf8'),
    manifestSource: readFileSync(join(crateRoot, 'Cargo.toml'), 'utf8'),
  });
}

function sourceMode(path: string): SourceMode {
  return execFileSync(compilerPath, ['source-mode', '--source', path], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim() as SourceMode;
}

function rootOnlyNames(path: string): string[] {
  const output = execFileSync(compilerPath, ['root-only', '--source', path], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim();
  return output === '' ? [] : output.split(/\r?\n/);
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

function testSupportArguments(rustPath: string): string[] {
  const source = readFileSync(rustPath, 'utf8');
  if (!/^use\s+crate::support::\*;\s*$/m.test(source)) return [];

  const supportPath = join(dirname(rustPath), 'support.rs');
  if (!existsSync(supportPath)) {
    throw new Error(`${relative(repositoryRoot, rustPath)} imports crate::support::* but tests/support.rs is missing`);
  }
  return ['--test-support-source', supportPath, '--test-support-module', 'support'];
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
