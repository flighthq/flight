// Generates the two flat @flighthq/types entry points used by repository tooling. TypeScript still
// emits the package normally first: the declaration pass composes those authoritative .d.ts files,
// while Vite/Rollup bundles the runtime symbols. Consumers then open one header instead of walking
// roughly eight hundred re-exported modules.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chokidar from 'chokidar';
import MagicString from 'magic-string';
import type { RollupOutput, OutputAsset, OutputChunk } from 'rollup';
import { SourceMapConsumer, SourceMapGenerator } from 'source-map-js';
import ts from 'typescript';
import { build } from 'vite';

const ENTRY_NAMES = ['index', 'contract'] as const;
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
    const matches = kind === 'export' ? ts.isExportDeclaration(statement) : ts.isImportDeclaration(statement);
    if (!matches || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
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

async function bundleJavascript(entryName: string): Promise<HeaderOutput[]> {
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
  return output.map((item) => ({
    path: join(scriptRoot, 'packages', 'types', 'dist', item.fileName),
    content:
      typeof item.source === 'string' ? item.source : isChunk(item) ? item.code : Buffer.from(item.source).toString(),
  }));
}

async function generateHeaders(): Promise<HeaderOutput[]> {
  const distDirectory = join(scriptRoot, 'packages', 'types', 'dist');
  const output: HeaderOutput[] = [];
  for (const entryName of ENTRY_NAMES) {
    const declaration = flattenDeclarations(distDirectory, entryName);
    output.push(
      { path: join(distDirectory, `${entryName}.d.ts`), content: declaration.code },
      { path: join(distDirectory, `${entryName}.d.ts.map`), content: declaration.map },
      ...(await bundleJavascript(entryName)),
    );
  }
  return output;
}

function buildTypes(): void {
  const result = spawnSync(
    process.execPath,
    [join(scriptRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', join(scriptRoot, 'packages', 'types')],
    { cwd: scriptRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error('TypeScript failed before compiled-header generation');
}

async function writeOrCheckHeaders(check: boolean): Promise<void> {
  buildTypes();
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
