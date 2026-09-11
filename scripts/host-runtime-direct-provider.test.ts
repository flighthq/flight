import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const PACKAGES = resolve(ROOT, 'packages');
const LEGACY_HOST_TRAITS = /\bHas(?:Menu\w*|ShareContent|TextSegmenter|TextShaper)\b/u;

interface Violation {
  declaration: string;
  file: string;
  type: string;
}

describe('runtime APIs use direct Host providers', () => {
  it('does not accept the whole Host, a Host capability group, or a structural Host group', () => {
    expect(collectOverbroadRuntimeParameters(runtimeSourceFiles())).toEqual([]);
  });

  it('does not retain structural Host group lookup types behind direct API parameters', () => {
    expect(collectStructuralHostGroupTypes(runtimeSourceFiles())).toEqual([]);
  });

  it('recognizes overbroad fixtures without rejecting direct providers', () => {
    const source = `
      interface Host {}
      interface HostTrayCapabilities {}
      interface HostTrayImageProvider {}
      export function whole(host: Host): void {}
      export function group(tray: Readonly<HostTrayCapabilities>): void {}
      export function structural<T extends { readonly tray: { readonly image: HostTrayImageProvider } }>(host: T): void {}
      export function direct(hostTrayImage: Readonly<HostTrayImageProvider>): void {}
      export const arrow = (host: Host): void => {};
      export const directArrow = (hostTrayImage: Readonly<HostTrayImageProvider>): void => {};
    `;

    expect(collectOverbroadRuntimeParameters([{ file: 'fixture.ts', source }])).toEqual([
      { declaration: 'arrow', file: 'fixture.ts', type: 'Host' },
      { declaration: 'group', file: 'fixture.ts', type: 'Readonly<HostTrayCapabilities>' },
      {
        declaration: 'structural',
        file: 'fixture.ts',
        type: '{ readonly tray: { readonly image: HostTrayImageProvider } }',
      },
      { declaration: 'whole', file: 'fixture.ts', type: 'Host' },
    ]);
  });

  it('keeps retired Host trait vocabulary out of production package sources', () => {
    const violations = runtimeSourceFiles()
      .filter(({ source }) => LEGACY_HOST_TRAITS.test(source))
      .map(({ file }) => file);
    expect(violations).toEqual([]);
  });
});

function collectOverbroadRuntimeParameters(files: readonly Source[]): Violation[] {
  const hostGroups = collectHostGroups();
  const violations: Violation[] = [];
  for (const { file, source } of files) {
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      if (!hasExportModifier(statement)) continue;
      if (ts.isFunctionDeclaration(statement)) {
        collectSignatureViolations(
          statement.name?.text ?? '<anonymous>',
          statement,
          file,
          sourceFile,
          hostGroups,
          violations,
        );
      } else if (ts.isVariableStatement(statement)) {
        for (const variable of statement.declarationList.declarations) {
          if (!ts.isIdentifier(variable.name)) continue;
          if (variable.initializer !== undefined && ts.isFunctionLike(variable.initializer)) {
            collectSignatureViolations(
              variable.name.text,
              variable.initializer,
              file,
              sourceFile,
              hostGroups,
              violations,
            );
          }
          if (variable.type !== undefined && ts.isFunctionTypeNode(variable.type)) {
            collectSignatureViolations(variable.name.text, variable.type, file, sourceFile, hostGroups, violations);
          }
        }
      }
    }
  }
  return violations.sort((left, right) =>
    `${left.file}:${left.declaration}:${left.type}`.localeCompare(`${right.file}:${right.declaration}:${right.type}`),
  );
}

function collectStructuralHostGroupTypes(files: readonly Source[]): Array<Pick<Violation, 'file' | 'type'>> {
  const hostGroups = collectHostGroups();
  const violations: Array<Pick<Violation, 'file' | 'type'>> = [];
  for (const { file, source } of files) {
    if (file.startsWith('packages/types/')) continue;
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (
        ts.isTypeLiteralNode(node) &&
        node.members.some(
          (member) =>
            ts.isPropertySignature(member) &&
            hostGroups.has(propertyName(member.name)) &&
            member.type !== undefined &&
            containsCapabilityMember(member.type, sourceFile),
        )
      ) {
        violations.push({ file, type: node.getText(sourceFile) });
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return violations.sort((left, right) => `${left.file}:${left.type}`.localeCompare(`${right.file}:${right.type}`));
}

function collectSignatureViolations(
  declaration: string,
  signature: ts.SignatureDeclaration,
  file: string,
  sourceFile: ts.SourceFile,
  hostGroups: ReadonlySet<string>,
  violations: Violation[],
): void {
  if (isHostConstructor(file, declaration)) return;
  for (const parameter of signature.parameters) {
    if (parameter.type !== undefined && isOverbroadType(parameter.type, sourceFile, hostGroups)) {
      violations.push({ declaration, file, type: parameter.type.getText(sourceFile) });
    }
  }
  for (const typeParameter of signature.typeParameters ?? []) {
    if (typeParameter.constraint !== undefined && isOverbroadType(typeParameter.constraint, sourceFile, hostGroups)) {
      violations.push({ declaration, file, type: typeParameter.constraint.getText(sourceFile) });
    }
  }
}

function isOverbroadType(type: ts.TypeNode, sourceFile: ts.SourceFile, hostGroups: ReadonlySet<string>): boolean {
  const text = type.getText(sourceFile);
  if (/\bHost\b/u.test(text) || /\bHost\w*Capabilities\b/u.test(text)) return true;

  let structuralHostGroup = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertySignature(node) &&
      hostGroups.has(propertyName(node.name)) &&
      node.type !== undefined &&
      containsCapabilityMember(node.type, sourceFile)
    ) {
      structuralHostGroup = true;
    }
    if (!structuralHostGroup) ts.forEachChild(node, visit);
  };
  visit(type);
  return structuralHostGroup;
}

function containsCapabilityMember(type: ts.TypeNode, sourceFile: ts.SourceFile): boolean {
  if (/\bHost\w*Provider\b/u.test(type.getText(sourceFile))) return true;
  let method = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isMethodSignature(node) ||
      (ts.isPropertySignature(node) && node.type !== undefined && ts.isFunctionTypeNode(node.type))
    ) {
      method = true;
    }
    if (!method) ts.forEachChild(node, visit);
  };
  visit(type);
  return method;
}

function isHostConstructor(file: string, declaration: string): boolean {
  return file === 'packages/entity/src/host.ts' && (declaration === 'createHost' || declaration === 'initializeHost');
}

function collectHostGroups(): ReadonlySet<string> {
  const source = readFileSync(resolve(PACKAGES, 'types/src/Host.ts'), 'utf8');
  const sourceFile = ts.createSourceFile('Host.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const groups = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== 'Host') continue;
    for (const member of statement.members) {
      if (ts.isPropertySignature(member)) groups.add(propertyName(member.name));
    }
  }
  expect(groups.size).toBeGreaterThan(0);
  return groups;
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) ?? false)
  );
}

function propertyName(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : '';
}

interface Source {
  file: string;
  source: string;
}

function runtimeSourceFiles(): Source[] {
  const files: Source[] = [];
  for (const packageEntry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!packageEntry.isDirectory() || packageEntry.name.startsWith('host-')) continue;
    const sourceRoot = resolve(PACKAGES, packageEntry.name, 'src');
    if (!existsSync(sourceRoot)) continue;
    for (const entry of readdirSync(sourceRoot, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
      const absolute = resolve(entry.parentPath, entry.name);
      files.push({ file: relative(ROOT, absolute), source: readFileSync(absolute, 'utf8') });
    }
  }
  return files;
}
