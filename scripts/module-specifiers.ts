import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import ts from 'typescript';

export interface ModuleSpecifierIssue {
  readonly column: number;
  readonly file: string;
  readonly line: number;
  readonly replacement: string | null;
  readonly specifier: string;
}

export interface ModuleSpecifierReport {
  readonly changedFiles: number;
  readonly issues: readonly ModuleSpecifierIssue[];
  readonly scannedFiles: number;
}

interface ModuleSpecifierSite {
  readonly end: number;
  readonly node: ts.StringLiteralLike;
  readonly start: number;
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
const OUTPUT_SOURCE_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  '.cjs': ['.cts'],
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
};
const SKIPPED_DIRECTORIES = new Set([
  '.artifacts',
  '.cache',
  '.claude',
  '.git',
  '.quimby',
  'build',
  'coverage',
  'dist',
  'incoming',
  'node_modules',
  'target',
  'worktrees',
]);

function isRelativeSpecifier(specifier: string): boolean {
  return specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
}

function isTypeScriptSourceSpecifier(specifier: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => specifier.endsWith(extension));
}

function firstExisting(candidates: readonly string[], fileExists: (path: string) => boolean): string | null {
  return candidates.find(fileExists) ?? null;
}

export function getTypeScriptSpecifierReplacement(
  containingFile: string,
  specifier: string,
  fileExists: (path: string) => boolean = existsSync,
): string | null | undefined {
  if (!isRelativeSpecifier(specifier) || specifier.includes('?') || specifier.includes('#')) return undefined;
  if (isTypeScriptSourceSpecifier(specifier)) return undefined;

  const containingDirectory = dirname(containingFile);
  const directSource = firstExisting(
    SOURCE_EXTENSIONS.map((extension) => resolve(containingDirectory, specifier + extension)),
    fileExists,
  );
  if (directSource !== null) return specifier + extname(directSource);

  const outputExtension = extname(specifier);
  const sourceExtensions = OUTPUT_SOURCE_EXTENSIONS[outputExtension];
  if (sourceExtensions !== undefined) {
    const withoutOutputExtension = specifier.slice(0, -outputExtension.length);
    const sourcePath = firstExisting(
      sourceExtensions.map((extension) => resolve(containingDirectory, withoutOutputExtension + extension)),
      fileExists,
    );
    return sourcePath === null ? undefined : withoutOutputExtension + extname(sourcePath);
  }

  // An explicit non-JavaScript extension names an asset or another real input format. Only a missing
  // extension is ambiguous and therefore dependent on a bundler's probing rules.
  if (outputExtension !== '') return undefined;

  const indexSource = firstExisting(
    SOURCE_EXTENSIONS.map((extension) => resolve(containingDirectory, specifier, `index${extension}`)),
    fileExists,
  );
  if (indexSource !== null) {
    const slash = specifier.endsWith('/') ? '' : '/';
    return `${specifier}${slash}index${extname(indexSource)}`;
  }

  // Do not invent a target when the source tree cannot prove one. The issue still fails the gate: an
  // extensionless module edge is precisely the implicit lookup this convention removes.
  return null;
}

function collectModuleSpecifierSites(sourceFile: ts.SourceFile): ModuleSpecifierSite[] {
  const sites: ModuleSpecifierSite[] = [];

  function add(node: ts.StringLiteralLike): void {
    sites.push({ end: node.getEnd() - 1, node, start: node.getStart(sourceFile) + 1 });
  }

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node.arguments[0]);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      add(node.argument.literal);
    } else if (
      ts.isExternalModuleReference(node) &&
      node.expression !== undefined &&
      ts.isStringLiteralLike(node.expression)
    ) {
      add(node.expression);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sites;
}

export function inspectTypeScriptModuleSpecifiers(
  filePath: string,
  text: string,
  fileExists: (path: string) => boolean = existsSync,
): readonly ModuleSpecifierIssue[] {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const issues: ModuleSpecifierIssue[] = [];

  for (const site of collectModuleSpecifierSites(sourceFile)) {
    const specifier = site.node.text;
    const replacement = getTypeScriptSpecifierReplacement(filePath, specifier, fileExists);
    if (replacement === undefined || replacement === specifier) continue;
    const { character, line } = sourceFile.getLineAndCharacterOfPosition(site.node.getStart(sourceFile));
    issues.push({
      column: character + 1,
      file: filePath,
      line: line + 1,
      replacement,
      specifier,
    });
  }

  return issues;
}

export function rewriteTypeScriptModuleSpecifiers(
  filePath: string,
  text: string,
  fileExists: (path: string) => boolean = existsSync,
): string {
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);
  const replacements = collectModuleSpecifierSites(sourceFile)
    .map((site) => ({
      ...site,
      replacement: getTypeScriptSpecifierReplacement(filePath, site.node.text, fileExists),
    }))
    .filter((site): site is ModuleSpecifierSite & { replacement: string } => typeof site.replacement === 'string')
    .sort((a, b) => b.start - a.start);

  let rewritten = text;
  for (const replacement of replacements) {
    rewritten = rewritten.slice(0, replacement.start) + replacement.replacement + rewritten.slice(replacement.end);
  }
  return rewritten;
}

function collectTypeScriptFiles(root: string): string[] {
  const files: string[] = [];

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        files.push(path);
      }
    }
  }

  walk(root);
  return files.sort();
}

export function checkTypeScriptModuleSpecifiers(root: string, fix: boolean): ModuleSpecifierReport {
  const files = collectTypeScriptFiles(root);
  const issues: ModuleSpecifierIssue[] = [];
  let changedFiles = 0;

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    const fileIssues = inspectTypeScriptModuleSpecifiers(filePath, text);
    for (const issue of fileIssues) issues.push({ ...issue, file: relative(root, issue.file) });
    if (!fix || fileIssues.length === 0) continue;
    const rewritten = rewriteTypeScriptModuleSpecifiers(filePath, text);
    if (rewritten === text) continue;
    writeFileSync(filePath, rewritten);
    changedFiles++;
  }

  return { changedFiles, issues, scannedFiles: files.length };
}

const scriptPath = process.argv[1] === undefined ? '' : resolve(process.argv[1]);
if (scriptPath === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(import.meta.dirname, '..');
  const fix = process.argv.includes('--fix');
  const report = checkTypeScriptModuleSpecifiers(root, fix);

  if (fix) {
    const rewrittenSpecifiers = report.issues.filter((issue) => issue.replacement !== null).length;
    const unresolved = report.issues.filter((issue) => issue.replacement === null);
    process.stdout.write(
      `${pc.green('✓')} rewrote ${rewrittenSpecifiers} relative module specifier(s) in ${report.changedFiles} file(s)\n`,
    );
    if (unresolved.length > 0) {
      process.stderr.write(`${pc.red('✗')} ${unresolved.length} extensionless module edge(s) remain unresolved\n`);
      for (const issue of unresolved.slice(0, 100)) {
        process.stderr.write(`  ${pc.dim(`${issue.file}:${issue.line}:${issue.column}`)} ${issue.specifier}\n`);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  if (report.issues.length === 0) {
    process.stdout.write(
      `${pc.green('✓')} ${report.scannedFiles} TypeScript files use explicit source extensions for relative module specifiers\n`,
    );
    process.exit(0);
  }

  process.stderr.write(
    `${pc.red('✗')} ${report.issues.length} relative TypeScript module specifier(s) do not name their source file:\n`,
  );
  for (const issue of report.issues.slice(0, 100)) {
    const replacement = issue.replacement === null ? 'unresolved; add its real extension' : issue.replacement;
    process.stderr.write(
      `  ${pc.dim(`${issue.file}:${issue.line}:${issue.column}`)} ${pc.yellow(issue.specifier)} → ${replacement}\n`,
    );
  }
  if (report.issues.length > 100) process.stderr.write(`  ... and ${report.issues.length - 100} more\n`);
  process.stderr.write('Run `npm run fix:module-specifiers` to rewrite resolvable TypeScript targets.\n');
  process.exit(1);
}
