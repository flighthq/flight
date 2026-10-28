import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderPublicExports } from './generate-rust-package-exports.ts';

interface Options {
  check: boolean;
  crateName: string;
  packageName: string;
}

type SourceMode = 'generate' | 'rust-only' | 'target-native';

interface PackageModule {
  fileName: string;
  mode: SourceMode;
  rustSource: string;
  typescript: string;
}

interface SymbolOwner {
  fileName: string;
  hasType: boolean;
  hasValue: boolean;
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

const stagingRoot = mkdtempSync(join(tmpdir(), 'flight-generate-'));
const stagingSourceRoot = join(stagingRoot, 'src');
const rawRoot = join(stagingRoot, 'raw');
mkdirSync(stagingSourceRoot, { recursive: true });
mkdirSync(rawRoot, { recursive: true });

try {
  const modules = sourceFiles(crateRoot)
    .map(loadModule)
    .filter((module): module is PackageModule => module !== null);
  const symbols = collectSymbols(modules);
  const generatedFiles: string[] = [];

  for (const module of modules) {
    if (module.mode !== 'generate') continue;
    const imports = crateImports(join(crateRoot, 'src', module.rustSource), module.fileName, symbols);
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
    let typescript = compile('generate-tests', rustPath, join(rawRoot, fileName), ['./contract.ts']);
    if (typescript.includes('crate.')) {
      typescript = "import { rustTestSupport as crate } from './rustTestSupport.ts';\n\n" + typescript;
    }
    writeGenerated(join(stagingSourceRoot, fileName), typescript, rustPath);
    generatedFiles.push(fileName);
  }

  writeGenerated(
    join(stagingSourceRoot, 'contract.ts'),
    contractExports(crateRoot, modules, symbols),
    join(crateRoot, 'src', 'lib.rs'),
  );
  writeGenerated(
    join(stagingSourceRoot, 'index.ts'),
    publicExports(crateRoot, modules, symbols),
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

function collectSymbols(modules: PackageModule[]): Map<string, SymbolOwner> {
  const symbols = new Map<string, SymbolOwner>();
  for (const module of modules) {
    const pattern = /^export (class|function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm;
    for (const match of module.typescript.matchAll(pattern)) {
      const owner = symbols.get(match[2]) ?? {
        fileName: module.fileName,
        hasType: false,
        hasValue: false,
      };
      if (owner.fileName !== module.fileName) {
        throw new Error(`duplicate generated symbol ${match[2]} in ${owner.fileName} and ${module.fileName}`);
      }
      const kind = match[1];
      owner.hasType ||= kind === 'class' || kind === 'enum' || kind === 'interface' || kind === 'type';
      owner.hasValue ||= kind === 'class' || kind === 'const' || kind === 'enum' || kind === 'function';
      symbols.set(match[2], owner);
    }
  }
  return symbols;
}

function compile(command: string, source: string, out: string, trailing: string[] = []): string {
  execFileSync(
    compilerPath,
    [command, '--source', source, '--out', out, ...entityArguments(command), ...contractArguments(command, trailing)],
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

function contractExports(crateRoot: string, modules: PackageModule[], symbols: Map<string, SymbolOwner>): string {
  const directives = modules.map((module) => ({
    module,
    names: sourceDirective(crateRoot, module, 'contract'),
  }));
  if (directives.every(({ names }) => names.length === 0)) {
    return modules.map((module) => `export * from './${module.fileName}';`).join('\n') + '\n';
  }

  let output = '';
  for (const { module, names } of directives) {
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
  return output;
}

function crateImports(rustPath: string, outputFileName: string, symbols: Map<string, SymbolOwner>): string {
  const rust = readFileSync(rustPath, 'utf8');
  const importedNames = new Set<string>();
  for (const match of rust.matchAll(/^use crate::(?:[A-Za-z0-9_]+::)?([A-Za-z0-9_]+);$/gm)) {
    importedNames.add(snakeToLowerCamel(match[1]));
  }
  for (const match of rust.matchAll(/^use crate::(?:[A-Za-z0-9_]+::)?\{([^}]+)\};$/gm)) {
    for (const name of match[1].split(',')) {
      const trimmed = name.trim();
      if (/^[A-Za-z0-9_]+$/.test(trimmed)) importedNames.add(snakeToLowerCamel(trimmed));
    }
  }

  const imports = new Map<string, { types: string[]; values: string[] }>();
  for (const name of importedNames) {
    const owner = symbols.get(name);
    if (!owner || owner.fileName === outputFileName) continue;
    const entry = imports.get(owner.fileName) ?? { types: [], values: [] };
    if (owner.hasValue) entry.values.push(name);
    else entry.types.push(name);
    imports.set(owner.fileName, entry);
  }

  let output = '';
  for (const [fileName, names] of [...imports].sort(([left], [right]) => left.localeCompare(right))) {
    if (names.types.length > 0) {
      output += `import type { ${names.types.sort().join(', ')} } from './${fileName}';\n`;
    }
    if (names.values.length > 0) {
      output += `import { ${names.values.sort().join(', ')} } from './${fileName}';\n`;
    }
  }
  return output.length === 0 ? output : output + '\n';
}

function entityArguments(command: string): string[] {
  if (command !== 'generate') return [];
  const specifier = options.packageName === 'entity' ? './types.ts' : '@flighthq/entity/contract';
  return ['--entity-module', specifier];
}

function finishGeneration(fileNames: string[]): void {
  const stale: string[] = [];
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
  if (stale.length > 0) {
    throw new Error(`generated output is stale: ${stale.join(', ')}; run npm run generate`);
  }
}

function formatterPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt');
}

function loadModule(rustSource: string): PackageModule | null {
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
    typescript: compile('generate', rustPath, join(rawRoot, fileName)),
  };
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

function publicExports(crateRoot: string, modules: PackageModule[], symbols: Map<string, SymbolOwner>): string {
  const roots: string[] = [];
  for (const module of modules) {
    roots.push(...sourceDirective(crateRoot, module, 'root'));
  }
  if (roots.length === 0) {
    const rust = readFileSync(join(crateRoot, 'src', 'lib.rs'), 'utf8');
    for (const match of rust.matchAll(/^pub use contract::([A-Za-z0-9_]+);$/gm)) {
      roots.push(snakeToLowerCamel(match[1]));
    }
  }

  return renderPublicExports(modules, symbols, roots);
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
  return readFileSync(path, 'utf8');
}

function snakeToLowerCamel(value: string): string {
  return value.replace(/_([a-z0-9][a-z0-9]*)/g, (_, word: string) => {
    const letter = word.search(/[a-z]/);
    if (letter === -1) return word;
    return word.slice(0, letter) + word[letter].toUpperCase() + word.slice(letter + 1);
  });
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
