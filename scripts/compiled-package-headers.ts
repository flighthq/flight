// Generates the canonical flat @flighthq/types contract and its curated one-edge public view.
// TypeScript still emits the package normally first: the declaration pass composes those
// authoritative .d.ts files, while Vite/Rollup bundles the runtime symbols. Consumers terminate the
// module walk within two files instead of traversing roughly eight hundred source modules.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chokidar from 'chokidar';
import MagicString from 'magic-string';
import type { RollupOutput, OutputAsset, OutputChunk } from 'rollup';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js';
import ts from 'typescript';
import { build } from 'vite';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const typesDistDirectory = join(scriptRoot, 'packages', 'types', 'dist');
const headerStampPath = join(typesDistDirectory, '.compiled-headers.json');
const expectedHeaderNames = [
  'contract.d.ts',
  'contract.d.ts.map',
  'contract.js',
  'contract.js.map',
  'index.d.ts',
  'index.d.ts.map',
  'index.js',
  'index.js.map',
] as const;

interface TextRange {
  end: number;
  start: number;
}

interface DeclarationModule {
  filePath: string;
  isPublic: boolean;
  ranges: TextRange[];
  sourceFile: ts.SourceFile;
  sourceMap: SourceMapConsumer;
  text: string;
}

export interface FlatDeclaration {
  code: string;
  map: string;
}

interface HeaderOutput {
  content: string;
  path: string;
}

interface JavascriptBundle {
  exports: string[];
  output: HeaderOutput[];
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }
  return starts;
}

function lineColumnAt(starts: readonly number[], offset: number): { column: number; line: number } {
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = (low + high) >>> 1;
    if (starts[middle] <= offset) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: offset - starts[low] };
}

function generatedOffset(starts: readonly number[], line: number, column: number): number {
  return (starts[line - 1] ?? 0) + column;
}

function declarationSpecifiers(sourceFile: ts.SourceFile, kind: 'export' | 'import'): string[] {
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) && !ts.isImportDeclaration(statement)) continue;
    if (kind === 'export' ? !ts.isExportDeclaration(statement) : !ts.isImportDeclaration(statement)) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (statement.moduleSpecifier.text.startsWith('.')) specifiers.push(statement.moduleSpecifier.text);
  }
  return specifiers;
}

function retainedRanges(sourceFile: ts.SourceFile, isPublic: boolean): TextRange[] {
  const ranges: TextRange[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
    let cursor = statement.getFullStart();
    const exportModifier = !isPublic
      ? ts.canHaveModifiers(statement) &&
        ts.getModifiers(statement)?.find((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : undefined;
    if (exportModifier) {
      ranges.push({ start: cursor, end: exportModifier.getStart(sourceFile) });
      cursor = exportModifier.end;
    }
    ranges.push({ start: cursor, end: statement.end });
  }
  return ranges.filter((range) => range.end > range.start);
}

function declarationPath(distDirectory: string, specifier: string): string {
  return resolve(distDirectory, `${specifier}.d.ts`);
}

function readDeclarationModule(filePath: string, isPublic: boolean): DeclarationModule {
  const text = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const mapPath = `${filePath}.map`;
  if (!existsSync(mapPath)) throw new Error(`Missing declaration map: ${relative(scriptRoot, mapPath)}`);
  const sourceMap = new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8')));
  return { filePath, isPublic, ranges: retainedRanges(sourceFile, isPublic), sourceFile, sourceMap, text };
}

export function flattenDeclarations(distDirectory: string, entryName: string): FlatDeclaration {
  // Read the source contract, not the emitted entry file: a previous header build has already
  // replaced that emitted barrel, and generation must remain idempotent.
  const sourceEntryPath = join(dirname(distDirectory), 'src', `${entryName}.ts`);
  const entryPath = existsSync(sourceEntryPath) ? sourceEntryPath : join(distDirectory, `${entryName}.d.ts`);
  const entryText = readFileSync(entryPath, 'utf8');
  const entrySource = ts.createSourceFile(entryPath, entryText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const publicSpecifiers = declarationSpecifiers(entrySource, 'export');
  const publicPaths = new Set(publicSpecifiers.map((specifier) => declarationPath(distDirectory, specifier)));
  const pending = [...publicPaths];
  const modules: DeclarationModule[] = [];
  const seen = new Set<string>();

  while (pending.length > 0) {
    const filePath = pending.shift()!;
    if (seen.has(filePath)) continue;
    seen.add(filePath);
    const declaration = readDeclarationModule(filePath, publicPaths.has(filePath));
    modules.push(declaration);
    for (const specifier of declarationSpecifiers(declaration.sourceFile, 'import')) {
      pending.push(declarationPath(distDirectory, specifier));
    }
  }

  const outputParts: string[] = [];
  const mappings: Array<{
    module: DeclarationModule;
    outputStart: number;
    range: TextRange;
  }> = [];
  let outputLength = 0;
  for (const declaration of modules) {
    for (const range of declaration.ranges) {
      const part = declaration.text.slice(range.start, range.end);
      mappings.push({ module: declaration, outputStart: outputLength, range });
      outputParts.push(part);
      outputLength += part.length;
    }
    outputParts.push('\n');
    outputLength++;
  }

  const mapFile = `${entryName}.d.ts`;
  const body = outputParts.join('').trimEnd();
  // Declaration files need an explicit empty export to keep non-exported transitive dependencies
  // private. Without it, TypeScript treats every ambient top-level declaration as importable.
  const code = `${body}\nexport {};\n//# sourceMappingURL=${mapFile}.map\n`;
  const outputStarts = lineStarts(code);
  const generator = new SourceMapGenerator({ file: mapFile });

  for (const mappingRange of mappings) {
    const inputStarts = lineStarts(mappingRange.module.text);
    mappingRange.module.sourceMap.eachMapping((mapping) => {
      if (mapping.source === null || mapping.originalLine === null || mapping.originalColumn === null) {
        return;
      }
      const inputOffset = generatedOffset(inputStarts, mapping.generatedLine, mapping.generatedColumn);
      if (inputOffset < mappingRange.range.start || inputOffset >= mappingRange.range.end) return;
      generator.addMapping({
        generated: lineColumnAt(outputStarts, mappingRange.outputStart + inputOffset - mappingRange.range.start),
        original: { line: mapping.originalLine, column: mapping.originalColumn },
        source: mapping.source,
        name: mapping.name,
      });
      const sourceContent = mappingRange.module.sourceMap.sourceContentFor(mapping.source, true);
      if (sourceContent !== null) generator.setSourceContent(mapping.source, sourceContent);
    });
  }

  const flattenedSource = ts.createSourceFile(mapFile, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const outgoing = flattenedSource.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) || (ts.isExportDeclaration(statement) && statement.moduleSpecifier),
  );
  if (outgoing) throw new Error(`${mapFile} still contains an outgoing declaration reference`);
  return { code, map: generator.toString() };
}

export function declarationExportNames(code: string): string[] {
  const sourceFile = ts.createSourceFile('header.d.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          throw new Error('Compiled headers do not support exported destructuring declarations');
        }
        names.add(declaration.name.text);
      }
      continue;
    }
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isModuleDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return [...names].sort();
}

export function namedReexport(names: readonly string[], target: string, sourceMapName: string): string {
  const uniqueNames = [...new Set(names)].sort();
  return `export {\n${uniqueNames.map((name) => `  ${name},`).join('\n')}\n} from '${target}';\n//# sourceMappingURL=${sourceMapName}\n`;
}

function reexportSourceMap(fileName: string): string {
  const source = '../src/index.ts';
  const generator = new SourceMapGenerator({ file: fileName });
  generator.addMapping({
    generated: { line: 1, column: 0 },
    original: { line: 1, column: 0 },
    source,
  });
  generator.setSourceContent(source, readFileSync(join(scriptRoot, 'packages', 'types', 'src', 'index.ts'), 'utf8'));
  return generator.toString();
}

function isChunk(output: OutputAsset | OutputChunk): output is OutputChunk {
  return output.type === 'chunk';
}

export function makeNamespaceMergeTreeShakeable(code: string): {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
} {
  const enumStart = 'var AppearanceFlags = /* @__PURE__ */ ((AppearanceFlags2) => {\n';
  const enumEnd = '\n})(AppearanceFlags || {});';
  const namespaceStart = '\n((AppearanceFlags2) => {\n';
  const namespaceEnd = '\n})(AppearanceFlags || (AppearanceFlags = {}));';
  const start = code.indexOf(enumStart);
  const enumClose = code.indexOf(enumEnd, start);
  const namespaceOpen = code.indexOf(namespaceStart, enumClose);
  const namespaceClose = code.indexOf(namespaceEnd, namespaceOpen);
  if (start < 0 || enumClose < 0 || namespaceOpen < 0 || namespaceClose < 0) {
    throw new Error('Expected the AppearanceFlags enum/namespace merge in the types bundle');
  }
  const end = namespaceClose + namespaceEnd.length;
  const enumBody = code.slice(start + enumStart.length, enumClose).replace(/\n  return AppearanceFlags2;$/, '');
  const body = `${enumBody}\n${code.slice(namespaceOpen + namespaceStart.length, namespaceClose)}`
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  const replacement = `var AppearanceFlags = /* @__PURE__ */ (() => {\n  const AppearanceFlags2 = {};\n${body}\n  return AppearanceFlags2;\n})();`;
  const magic = new MagicString(code);
  magic.overwrite(start, end, replacement);
  return { code: magic.toString(), map: magic.generateMap({ hires: true }) };
}

async function bundleJavascript(entryName: string): Promise<JavascriptBundle> {
  const sourcePath = join(scriptRoot, 'packages', 'types', 'src', `${entryName}.ts`);
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'compiled-types-header-tree-shaking',
        renderChunk(code) {
          return makeNamespaceMergeTreeShakeable(code);
        },
      },
    ],
    build: {
      lib: { entry: sourcePath, fileName: entryName, formats: ['es'] },
      minify: false,
      sourcemap: true,
      write: false,
    },
  });
  const builds = (Array.isArray(result) ? result : [result]) as RollupOutput[];
  const output = builds.flatMap((buildResult) => buildResult.output);
  const chunk = output.find((item): item is OutputChunk => isChunk(item) && item.isEntry);
  if (!chunk || chunk.imports.length > 0 || chunk.dynamicImports.length > 0) {
    throw new Error(`${entryName}.js did not produce one reference-free entry chunk`);
  }
  return {
    exports: [...chunk.exports].sort(),
    output: output.map((item) => ({
      path: join(typesDistDirectory, item.fileName),
      content: isChunk(item)
        ? item.code
        : typeof item.source === 'string'
          ? item.source
          : Buffer.from(item.source).toString(),
    })),
  };
}

async function generateHeaders(): Promise<HeaderOutput[]> {
  // The contract artifacts are the package's only declaration/definition sites. The public entry is
  // a named subset view with one edge to that canonical flat unit. Besides bounding the walk at two
  // files, this preserves unique-symbol brands and runtime Symbol() identities across both lanes.
  const publicDeclaration = flattenDeclarations(typesDistDirectory, 'index');
  const contractDeclaration = flattenDeclarations(typesDistDirectory, 'contract');
  const publicDeclarationExports = declarationExportNames(publicDeclaration.code);
  const publicJavascript = await bundleJavascript('index');
  const contractJavascript = await bundleJavascript('contract');
  const contractRuntimeExports = new Set(contractJavascript.exports);
  const missingRuntimeExports = publicJavascript.exports.filter((name) => !contractRuntimeExports.has(name));
  if (missingRuntimeExports.length > 0) {
    throw new Error(`Public runtime exports missing from canonical contract: ${missingRuntimeExports.join(', ')}`);
  }

  const indexDeclarationName = 'index.d.ts';
  const indexJavascriptName = 'index.js';
  return [
    { path: join(typesDistDirectory, 'contract.d.ts'), content: contractDeclaration.code },
    { path: join(typesDistDirectory, 'contract.d.ts.map'), content: contractDeclaration.map },
    ...contractJavascript.output,
    {
      path: join(typesDistDirectory, indexDeclarationName),
      content: namedReexport(publicDeclarationExports, './contract', `${indexDeclarationName}.map`),
    },
    {
      path: join(typesDistDirectory, `${indexDeclarationName}.map`),
      content: reexportSourceMap(indexDeclarationName),
    },
    {
      path: join(typesDistDirectory, indexJavascriptName),
      content: namedReexport(publicJavascript.exports, './contract.js', `${indexJavascriptName}.map`),
    },
    {
      path: join(typesDistDirectory, `${indexJavascriptName}.map`),
      content: reexportSourceMap(indexJavascriptName),
    },
  ];
}

function buildTypes(): void {
  const result = spawnSync(
    process.execPath,
    [join(scriptRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', join(scriptRoot, 'packages', 'types')],
    { cwd: scriptRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('TypeScript failed before compiled-header generation');
}

function headerInputSignature(): string {
  const hash = createHash('sha256');
  for (const path of [
    join(scriptRoot, 'packages', 'types', 'tsconfig.tsbuildinfo'),
    fileURLToPath(import.meta.url),
    join(scriptRoot, 'packages', 'types', 'tsconfig.json'),
    join(scriptRoot, 'tsconfig.base.json'),
    join(scriptRoot, 'package-lock.json'),
  ]) {
    hash.update(path);
    hash.update(readFileSync(path));
  }
  return hash.digest('hex');
}

function headersAreStamped(signature: string): boolean {
  if (!existsSync(headerStampPath)) return false;
  if (expectedHeaderNames.some((name) => !existsSync(join(typesDistDirectory, name)))) return false;
  try {
    return JSON.parse(readFileSync(headerStampPath, 'utf8')).signature === signature;
  } catch {
    return false;
  }
}

async function writeOrCheckHeaders(check: boolean): Promise<void> {
  buildTypes();
  const signature = headerInputSignature();
  if (!check && headersAreStamped(signature)) {
    console.log('Compiled @flighthq/types header artifacts are current');
    return;
  }
  const output = await generateHeaders();
  const stale = output.filter((file) => !existsSync(file.path) || readFileSync(file.path, 'utf8') !== file.content);
  if (check) {
    if (stale.length > 0) {
      throw new Error(`Stale compiled headers: ${stale.map((file) => relative(scriptRoot, file.path)).join(', ')}`);
    }
    console.log(`OK ${output.length} compiled @flighthq/types header artifacts are current`);
    return;
  }
  for (const file of stale) writeFileSync(file.path, file.content);
  writeFileSync(headerStampPath, `${JSON.stringify({ signature })}\n`);
  console.log(`Built ${output.length} compiled @flighthq/types header artifacts`);
}

async function watchHeaders(): Promise<void> {
  await writeOrCheckHeaders(false);
  const watcher = chokidar.watch(join(scriptRoot, 'packages', 'types', 'src'), {
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 25 },
    ignoreInitial: true,
  });
  let active = false;
  let queued = false;
  const rebuild = async (): Promise<void> => {
    if (active) {
      queued = true;
      return;
    }
    active = true;
    do {
      queued = false;
      try {
        await writeOrCheckHeaders(false);
      } catch (error) {
        console.error(error);
      }
    } while (queued);
    active = false;
  };
  watcher.on('all', () => void rebuild());
  console.log('Watching packages/types/src for compiled-header changes');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const watch = process.argv.includes('--watch');
  const check = process.argv.includes('--check');
  (watch ? watchHeaders() : writeOrCheckHeaders(check)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
