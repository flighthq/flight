import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

interface Source {
  file: string;
  source: string;
}

interface Violation {
  file: string;
  line: number;
  term: string;
}

describe('host-composition terminology', () => {
  it('keeps retired Host names out of user-facing documentation and source comments', () => {
    const files = trackedFiles();
    const production = productionSourceFiles(files);
    const currentSymbols = collectDeclaredSymbols(production);

    expect(collectViolations([...documentationFiles(files), ...production], currentSymbols)).toEqual([]);
  });

  it('rejects retired names without rejecting current providers, graph traits, or domain backends', () => {
    const currentSymbols = collectDeclaredSymbols(productionSourceFiles(trackedFiles()));
    const fixtures: Source[] = [
      {
        file: 'README.md',
        source: [
          'Retired: HasSoftKeyboard, DeviceBackend, webDeviceBackend, and setDeviceBackend.',
          'Current: HostDeviceProvider, HasTransform3D, CursorBackend, and webTextSegmenterBackend.',
        ].join('\n'),
      },
      {
        file: 'packages/example/src/example.ts',
        source: [
          'const DeviceBackend = "code is not prose";',
          'const text = "HasSoftKeyboard in a string is not documentation";',
          '// WindowBackend is retired comment vocabulary.',
        ].join('\n'),
      },
    ];

    expect(collectViolations(fixtures, currentSymbols)).toEqual([
      { file: 'README.md', line: 1, term: 'DeviceBackend' },
      { file: 'README.md', line: 1, term: 'HasSoftKeyboard' },
      { file: 'README.md', line: 1, term: 'setDeviceBackend' },
      { file: 'README.md', line: 1, term: 'webDeviceBackend' },
      { file: 'packages/example/src/example.ts', line: 3, term: 'WindowBackend' },
    ]);
  });
});

function collectDeclaredSymbols(files: readonly Source[]): ReadonlySet<string> {
  const symbols = new Set<string>();
  for (const { source } of files) {
    for (const match of source.matchAll(
      /^\s*(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|type|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/gmu,
    )) {
      symbols.add(match[1]);
    }
  }
  return symbols;
}

function collectViolations(files: readonly Source[], currentSymbols: ReadonlySet<string>): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const fragments = isDocumentation(file.file) ? markdownLines(file) : sourceComments(file);
    for (const { line, text } of fragments) {
      for (const term of new Set(text.match(/\b[A-Za-z][A-Za-z0-9]*\b/gu) ?? [])) {
        if (isRetiredHostTerm(term, currentSymbols)) violations.push({ file: file.file, line, term });
      }
    }
  }
  return violations.sort((left, right) =>
    compareText(
      `${left.file}:${left.line.toString().padStart(8, '0')}:${left.term}`,
      `${right.file}:${right.line.toString().padStart(8, '0')}:${right.term}`,
    ),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function documentationFiles(files: readonly string[]): Source[] {
  return files
    .filter(
      (file) => isDocumentation(file) && file !== 'AGENTS.md' && file !== 'CLAUDE.md' && !file.startsWith('agents/'),
    )
    .map(readSource);
}

function isDocumentation(file: string): boolean {
  return file.endsWith('.md') || file.endsWith('.mdx');
}

function isRetiredHostTerm(term: string, currentSymbols: ReadonlySet<string>): boolean {
  if (currentSymbols.has(term)) return false;
  if (/^Has[A-Z][A-Za-z0-9]*$/u.test(term)) return true;
  if (/^[A-Z][A-Za-z0-9]*Backend$/u.test(term)) return true;
  if (/^web[A-Z][A-Za-z0-9]*Backend$/u.test(term)) return true;
  return /^(?:explain|get|has|install|observe|reset|set)[A-Z][A-Za-z0-9]*(?:Backend|HostResult|Operation)(?:ForTest)?$/u.test(
    term,
  );
}

function markdownLines({ source }: Readonly<Source>): Array<{ line: number; text: string }> {
  return source.split('\n').map((text, index) => ({ line: index + 1, text }));
}

function productionSourceFiles(files: readonly string[]): Source[] {
  return files
    .filter(
      (file) =>
        (file.startsWith('examples/') || file.startsWith('packages/')) &&
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('.d.ts') &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test.tsx') &&
        !file.endsWith('.spec.ts') &&
        !file.endsWith('.spec.tsx'),
    )
    .map(readSource);
}

function readSource(file: string): Source {
  return { file, source: readFileSync(resolve(ROOT, file), 'utf8') };
}

function scriptKind(file: string): ts.ScriptKind {
  return extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceComments(file: Readonly<Source>): Array<{ line: number; text: string }> {
  if (!mightContainRetiredHostTerm(file.source)) return [];
  const sourceFile = ts.createSourceFile(file.file, file.source, ts.ScriptTarget.Latest, true, scriptKind(file.file));
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    extname(file.file) === '.tsx' ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    file.source,
  );
  const comments: Array<{ line: number; text: string }> = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    comments.push({
      line: sourceFile.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1,
      text: scanner.getTokenText(),
    });
  }
  return comments;
}

function mightContainRetiredHostTerm(source: string): boolean {
  return /\b(?:Has[A-Z][A-Za-z0-9]*|[A-Z][A-Za-z0-9]*Backend|web[A-Z][A-Za-z0-9]*Backend|(?:explain|get|has|install|observe|reset|set)[A-Z][A-Za-z0-9]*(?:Backend|HostResult|Operation)(?:ForTest)?)\b/u.test(
    source,
  );
}

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}
