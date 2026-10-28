import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Options {
  crateName: string;
  packageName: string;
}

interface GeneratedModule {
  fileName: string;
  rustSource: string;
  typescript: string;
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

const modules = sourceFiles(crateRoot).map((rustSource) => {
  const fileName = `${snakeToLowerCamel(rustSource.slice(0, -3))}.ts`;
  return {
    fileName,
    rustSource,
    typescript: compile('generate', join(crateRoot, 'src', rustSource), join(packageSourceRoot, fileName)),
  };
});
const symbols = collectSymbols(modules);

for (const module of modules) {
  const imports = crateImports(join(crateRoot, 'src', module.rustSource), module.fileName, symbols);
  writeGenerated(join(packageSourceRoot, module.fileName), imports + module.typescript);
}

for (const rustTest of testFiles(crateRoot)) {
  const fileName = `${snakeToLowerCamel(rustTest.slice(0, -8))}.test.ts`;
  let typescript = compile('generate-tests', join(crateRoot, 'tests', rustTest), join(packageSourceRoot, fileName), [
    './contract.ts',
  ]);
  if (typescript.includes('crate.')) {
    typescript = "import { rustTestSupport as crate } from './rustTestSupport.ts';\n\n" + typescript;
  }
  writeGenerated(join(packageSourceRoot, fileName), typescript);
}

writeGenerated(
  join(packageSourceRoot, 'contract.ts'),
  modules.map((module) => `export * from './${module.fileName}';`).join('\n') + '\n',
);
writeGenerated(join(packageSourceRoot, 'index.ts'), publicExports(crateRoot, symbols));
execFileSync(formatterPath(), ['--write', packageSourceRoot], { cwd: repositoryRoot, stdio: 'inherit' });
execFileSync(tsxPath(), [join(repositoryRoot, 'scripts', 'order.ts'), '--fix', packageSourceRoot], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
execFileSync(formatterPath(), ['--write', packageSourceRoot], { cwd: repositoryRoot, stdio: 'inherit' });

function collectSymbols(modules: GeneratedModule[]): Map<string, { fileName: string; typeOnly: boolean }> {
  const symbols = new Map<string, { fileName: string; typeOnly: boolean }>();
  for (const module of modules) {
    const pattern = /^export (function|const|enum|interface|type) ([A-Za-z0-9_]+)/gm;
    for (const match of module.typescript.matchAll(pattern)) {
      symbols.set(match[2], {
        fileName: module.fileName,
        typeOnly: match[1] === 'interface' || match[1] === 'type',
      });
    }
  }
  return symbols;
}

function compile(command: string, source: string, out: string, trailing: string[] = []): string {
  execFileSync(compilerPath, [command, '--source', source, '--out', out, ...contractArguments(command, trailing)], {
    cwd: repositoryRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return readFileSync(out, 'utf8');
}

function contractArguments(command: string, trailing: string[]): string[] {
  if (command !== 'generate-tests') return trailing;
  return ['--contract-module', ...trailing];
}

function crateImports(
  rustPath: string,
  outputFileName: string,
  symbols: Map<string, { fileName: string; typeOnly: boolean }>,
): string {
  const rust = readFileSync(rustPath, 'utf8');
  const imports = new Map<string, { types: string[]; values: string[] }>();
  for (const match of rust.matchAll(/^use crate::([A-Za-z0-9_]+);$/gm)) {
    const name = snakeToLowerCamel(match[1]);
    const owner = symbols.get(name);
    if (!owner || owner.fileName === outputFileName) continue;
    const entry = imports.get(owner.fileName) ?? { types: [], values: [] };
    (owner.typeOnly ? entry.types : entry.values).push(name);
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

function parseOptions(arguments_: string[]): Options {
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index];
    const value = arguments_[index + 1];
    if (!key?.startsWith('--') || !value) throw new Error('usage: --crate <crate> --package <package>');
    values.set(key, value);
  }
  const crateName = values.get('--crate');
  const packageName = values.get('--package');
  if (!crateName || !packageName) throw new Error('usage: --crate <crate> --package <package>');
  return { crateName, packageName };
}

function formatterPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'oxfmt.cmd' : 'oxfmt');
}

function tsxPath(): string {
  return join(repositoryRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
}

function publicExports(crateRoot: string, symbols: Map<string, { fileName: string; typeOnly: boolean }>): string {
  const rust = readFileSync(join(crateRoot, 'src', 'lib.rs'), 'utf8');
  const types: string[] = [];
  const values: string[] = [];
  for (const match of rust.matchAll(/^pub use contract::([A-Za-z0-9_]+);$/gm)) {
    const name = snakeToLowerCamel(match[1]);
    (symbols.get(name)?.typeOnly ? types : values).push(name);
  }
  let output = '';
  if (values.length > 0) output += `export {\n  ${values.sort().join(',\n  ')},\n} from './contract.ts';\n`;
  if (types.length > 0) output += `\nexport type { ${types.sort().join(', ')} } from './contract.ts';\n`;
  return output;
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

function testFiles(crateRoot: string): string[] {
  return readdirSync(join(crateRoot, 'tests'))
    .filter((fileName) => fileName.endsWith('_test.rs'))
    .sort();
}

function writeGenerated(path: string, contents: string): void {
  writeFileSync(
    path,
    `// Generated by npm run generate. Do not edit.\n/* oxlint-disable prefer-const */\n/* oxlint-disable double-comparisons */\n\n${contents}`,
  );
}
