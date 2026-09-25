import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import pc from 'picocolors';
import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance.ts';

export interface OpaqueValueSite {
  readonly column: number;
  readonly file: string;
  readonly interfaceName: string;
  readonly kind: 'any' | 'record-unknown' | 'unknown';
  readonly line: number;
  readonly propertyName: string;
  readonly typeText: string;
}

export interface OpaqueValueReport {
  readonly allowlisted: readonly OpaqueValueSite[];
  readonly scannedFiles: number;
  readonly violations: readonly OpaqueValueSite[];
}

export function createEmptyOpaqueValueReport(): OpaqueValueReport {
  return { allowlisted: [], scannedFiles: 0, violations: [] };
}

// Properties named 'error' typed as 'unknown' are the correct TS pattern for exception values.
const ERROR_PROPERTY_ALLOWLISTED = true;

// Intentional uses: generic constraints, opaque handle types, platform boundary types.
const ALLOWLIST: ReadonlySet<string> = new Set([
  'NodeAny',
  'Signal',
  'SignalConnection',
  'SignalScope.connections',
  'TweenManager.tweens',
  'NativeSurfaceHandle',
  'NativeWindowHandle',
]);

function collectTypeSourceFiles(root: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(full);
      }
    }
  }
  walk(root);
  return files;
}

function isOpaqueType(node: ts.TypeNode): 'any' | 'record-unknown' | 'unknown' | null {
  if (node.kind === ts.SyntaxKind.AnyKeyword) return 'any';
  if (node.kind === ts.SyntaxKind.UnknownKeyword) return 'unknown';
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText();
    if ((name === 'Record' || name === 'Readonly') && node.typeArguments) {
      for (const arg of node.typeArguments) {
        if (ts.isTypeReferenceNode(arg)) {
          const inner = isOpaqueType(arg);
          if (inner) return inner;
        }
        if (arg.kind === ts.SyntaxKind.UnknownKeyword) return 'record-unknown';
        if (arg.kind === ts.SyntaxKind.AnyKeyword) return 'any';
      }
    }
  }
  if (ts.isUnionTypeNode(node)) {
    for (const member of node.types) {
      const inner = isOpaqueType(member);
      if (inner) return inner;
    }
  }
  if (ts.isArrayTypeNode(node)) return isOpaqueType(node.elementType);
  return null;
}

export function checkOpaqueValues(root: string): OpaqueValueReport {
  const typesDir = resolve(root, 'packages/types/src');
  const sourceFiles = collectTypeSourceFiles(typesDir);
  const allowlisted: OpaqueValueSite[] = [];
  const violations: OpaqueValueSite[] = [];

  for (const filePath of sourceFiles) {
    const text = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    function visitInterface(node: ts.Node, parentName: string): void {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
        const name = ts.isInterfaceDeclaration(node) ? node.name.text : parentName;
        for (const member of node.members) {
          if (ts.isIndexSignatureDeclaration(member)) continue;
          if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) continue;

          const propName = member.name?.getText(sourceFile) ?? '';
          if (!propName) continue;

          let typeNode: ts.TypeNode | undefined;
          if (ts.isPropertySignature(member)) {
            typeNode = member.type;
          } else if (ts.isMethodSignature(member)) {
            for (const param of member.parameters) {
              if (param.type) {
                const kind = isOpaqueType(param.type);
                if (kind) {
                  const { line, character } = sourceFile.getLineAndCharacterOfPosition(member.getStart());
                  const site: OpaqueValueSite = {
                    column: character + 1,
                    file: relative(root, filePath),
                    interfaceName: name,
                    kind,
                    line: line + 1,
                    propertyName: propName,
                    typeText: param.type.getText(sourceFile),
                  };
                  const key = `${name}.${propName}`;
                  const isAllowed =
                    ALLOWLIST.has(key) ||
                    ALLOWLIST.has(name) ||
                    (ERROR_PROPERTY_ALLOWLISTED && propName === 'error' && kind === 'unknown');
                  if (isAllowed) {
                    allowlisted.push(site);
                  } else {
                    violations.push(site);
                  }
                }
              }
            }
            typeNode = member.type;
          }

          if (!typeNode) continue;
          const kind = isOpaqueType(typeNode);
          if (!kind) continue;

          const { line, character } = sourceFile.getLineAndCharacterOfPosition(member.getStart());
          const site: OpaqueValueSite = {
            column: character + 1,
            file: relative(root, filePath),
            interfaceName: name,
            kind,
            line: line + 1,
            propertyName: propName,
            typeText: typeNode.getText(sourceFile),
          };

          const key = `${name}.${propName}`;
          const isAllowed =
            ALLOWLIST.has(key) ||
            ALLOWLIST.has(name) ||
            (ERROR_PROPERTY_ALLOWLISTED && propName === 'error' && kind === 'unknown');
          if (isAllowed) {
            allowlisted.push(site);
          } else {
            violations.push(site);
          }
        }
      }

      if (ts.isTypeAliasDeclaration(node)) {
        const aliasName = node.name.text;
        if (ts.isTypeLiteralNode(node.type)) {
          visitInterface(node.type, aliasName);
          return;
        }
        const kind = isOpaqueType(node.type);
        if (kind) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          const site: OpaqueValueSite = {
            column: character + 1,
            file: relative(root, filePath),
            interfaceName: aliasName,
            kind,
            line: line + 1,
            propertyName: aliasName,
            typeText: node.type.getText(sourceFile),
          };
          if (ALLOWLIST.has(aliasName)) {
            allowlisted.push(site);
          } else {
            violations.push(site);
          }
        }
      }

      ts.forEachChild(node, (child) => visitInterface(child, parentName));
    }

    visitInterface(sourceFile, '');
  }

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  allowlisted.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return { allowlisted, scannedFiles: sourceFiles.length, violations };
}

const root = resolve(import.meta.dirname, '..');
const report = checkOpaqueValues(root);
const treeState = readGateTreeState(root);

const provenance = formatGateProvenance(
  {
    command: 'npm run opaque-values:check',
    counting:
      'exported interface properties typed as Record<string, unknown>, bare any, or bare unknown ' +
      '(excluding allowlisted error values, platform boundaries, and generic constraints)',
    scope: 'packages/types/src/**/*.ts (non-test)',
  },
  treeState,
);
process.stdout.write(`${provenance}\n`);

if (report.violations.length === 0 && report.allowlisted.length === 0) {
  process.stdout.write(`${pc.green('OK')} no opaque value domains found across ${report.scannedFiles} files\n`);
  process.exit(0);
}

if (report.violations.length > 0) {
  process.stdout.write(
    `\n${pc.yellow(`${report.violations.length} opaque value domains`)} across ${report.scannedFiles} files:\n\n`,
  );
  for (const site of report.violations) {
    const tag = site.kind === 'record-unknown' ? 'Record<?,unknown>' : site.kind;
    process.stdout.write(
      `  ${pc.dim(`${site.file}:${site.line}`)} ${site.interfaceName}.${pc.yellow(site.propertyName)} [${tag}]: ${pc.dim(site.typeText)}\n`,
    );
  }
}

if (report.allowlisted.length > 0) {
  process.stdout.write(
    `\n${pc.dim(`${report.allowlisted.length} allowlisted sites (error values, platform boundary, generic constraints)`)}\n`,
  );
}

const BASELINE = 23;

process.stdout.write(
  `\nbaseline: ${BASELINE}  current: ${report.violations.length}  allowlisted: ${report.allowlisted.length}\n`,
);

if (report.violations.length > BASELINE) {
  process.stdout.write(
    `\n${pc.red('✗')} opaque value count ${report.violations.length} exceeds baseline ${BASELINE}\n` +
      `  Use a named value domain instead of unknown/any/Record<string, unknown>.\n` +
      `  If the opaque type is intentional, add to the allowlist in scripts/check-opaque-values.ts with a reason.\n`,
  );
  process.exit(1);
}

if (report.violations.length < BASELINE) {
  process.stdout.write(
    `\n${pc.green('✓')} opaque value count dropped from ${BASELINE} to ${report.violations.length} — ` +
      `update BASELINE in scripts/check-opaque-values.ts to ${report.violations.length} to ratchet\n`,
  );
}

process.stdout.write(
  `\n${pc.green('OK')} opaque value count ${report.violations.length} within baseline ${BASELINE}\n`,
);
