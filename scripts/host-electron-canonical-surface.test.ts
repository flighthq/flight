import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SELF = 'scripts/host-electron-canonical-surface.test.ts';
const LEGACY =
  /\b(?:ElectronBackendOptions|createElectron[A-Za-z0-9]*(?:Backend|Backends|Capabilities)|initializeElectron[A-Za-z0-9]*(?:Backend|Backends|Capabilities)|initialize(?:App|Menu|Power|Protocol|Screen|Shell|Tray)[A-Za-z0-9]*Backend|makeElectronShellCapabilities|registerElectronBackends)\b/gu;

describe('Electron canonical Host surface', () => {
  it('keeps removed constructor and registrar names out of source, tests, examples, and prose', () => {
    const findings: string[] = [];
    for (const path of repositoryFiles()) {
      const file = relative(ROOT, path);
      if (file === SELF) continue;
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(LEGACY)) {
        const line = source.slice(0, match.index).split('\n').length;
        findings.push(`${file}:${line}: ${match[0]}`);
      }
    }
    expect(findings.sort()).toEqual([]);
  });

  it('does not retain the legacy options module', () => {
    expect(existsSync(resolve(ROOT, 'packages/types/src/ElectronBackendOptions.ts'))).toBe(false);
  });

  it('keeps initializer-era and Backend names out of the emitted contract surface', () => {
    const contract = resolve(ROOT, 'packages/host-electron/src/contract.ts');
    const source = ts.createSourceFile(contract, readFileSync(contract, 'utf8'), ts.ScriptTarget.Latest, true);
    const forbidden = source.statements.flatMap((statement) => {
      if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        return [];
      }
      return statement.exportClause.elements
        .map((element) => element.name.text)
        .filter((name) => /(?:Backend|registerBackends|^(?:initialize|populate)|ForTest$)/u.test(name));
    });
    expect(forbidden).toEqual([]);
  });

  it('gives every canonical constructor an explicit non-Backend return type', () => {
    const findings: string[] = [];
    const canonicalNames = new Set(contractExportNames().filter((name) => /^electronHost(?:$|[A-Z])/u.test(name)));
    const sourceRoot = resolve(ROOT, 'packages/host-electron/src');
    for (const path of sourceFiles(sourceRoot).filter((path) => !path.endsWith('.test.ts'))) {
      const file = relative(ROOT, path);
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isFunctionDeclaration(statement) || !statement.name || !canonicalNames.has(statement.name.text))
          continue;
        const returnType = statement.type?.getText(source);
        if (returnType === undefined || /(?:Backend|NonEntityCreateResult)/u.test(returnType)) {
          const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1;
          findings.push(`${file}:${line}: ${statement.name.text}: ${returnType ?? '<implicit>'}`);
        }
      }
    }
    expect(findings).toEqual([]);
  });
});

function contractExportNames(): string[] {
  const contract = resolve(ROOT, 'packages/host-electron/src/contract.ts');
  const source = ts.createSourceFile(contract, readFileSync(contract, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
      return [];
    }
    return statement.exportClause.elements.map((element) => element.name.text);
  });
}

function repositoryFiles(): string[] {
  return ['packages', 'examples', 'scripts', 'tools'].flatMap((directory) => sourceFiles(resolve(ROOT, directory)));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === 'dist' || entry.name === 'node_modules' ? [] : sourceFiles(path);
      if (!entry.isFile()) return [];
      return /\.(?:json|md|mdx|ts|tsx)$/u.test(entry.name) ? [path] : [];
    })
    .sort();
}
