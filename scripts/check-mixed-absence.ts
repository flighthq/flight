import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import pc from 'picocolors';
import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance';

export interface MixedAbsenceSite {
  readonly column: number;
  readonly file: string;
  readonly interfaceName: string;
  readonly line: number;
  readonly propertyName: string;
  readonly typeText: string;
}

export interface MixedAbsenceReport {
  readonly allowlisted: readonly MixedAbsenceSite[];
  readonly scannedFiles: number;
  readonly violations: readonly MixedAbsenceSite[];
}

export function createEmptyMixedAbsenceReport(): MixedAbsenceReport {
  return { allowlisted: [], scannedFiles: 0, violations: [] };
}

// Intentional dual-sentinel: undefined = not yet lazily resolved, null = program doesn't have this uniform
// Intentional dual-sentinel: undefined = not specified in partial update, null = explicitly auto/unset (CSS model)
// Intentional dual-sentinel: undefined = not provided by platform, null = spec-defined absence
const ALLOWLIST: ReadonlySet<string> = new Set([
  'GlMeshProgram.locColorScale',
  'GlMeshProgram.locColorBias',
  'GlMeshProgram.locColorMatrix0',
  'GlMeshProgram.locColorMatrix1',
  'GlMeshProgram.locColorMatrix2',
  'GlMeshProgram.locColorMatrix3',
  'GlMeshProgram.locColorMatrixOffset',
  'GlMeshProgram.locObjectAlpha',
  'GlMeshProgram.locAlphaIsCoverage',
  'GlMeshProgram.locJointTexture',
  'GlMeshProgram.locInstancePalette',
  'GlMeshProgram.locInstanceColorPalette',
  'GlMeshProgram.locJointNormalTexture',
  'GlMeshProgram.locUvTransform',
  'AnchorLayoutItemStyle.bottom',
  'AnchorLayoutItemStyle.height',
  'AnchorLayoutItemStyle.left',
  'AnchorLayoutItemStyle.right',
  'AnchorLayoutItemStyle.top',
  'AnchorLayoutItemStyle.width',
  'CapacitorGeolocationCoordinates.altitudeAccuracy',
]);

function containsNull(node: ts.TypeNode): boolean {
  if (ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isUnionTypeNode(node)) return node.types.some(containsNull);
  if (ts.isParenthesizedTypeNode(node)) return containsNull(node.type);
  return false;
}

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

export function checkMixedAbsence(root: string): MixedAbsenceReport {
  const typesDir = resolve(root, 'packages/types/src');
  const sourceFiles = collectTypeSourceFiles(typesDir);
  const allowlisted: MixedAbsenceSite[] = [];
  const violations: MixedAbsenceSite[] = [];

  for (const filePath of sourceFiles) {
    const text = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node, parentName: string): void {
      if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
        const name = ts.isInterfaceDeclaration(node) ? node.name.text : parentName;
        for (const member of node.members) {
          if (!ts.isPropertySignature(member)) continue;
          if (!member.questionToken) continue;
          if (!member.type) continue;
          if (!containsNull(member.type)) continue;

          const propName = member.name.getText(sourceFile);
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(member.getStart());
          const site: MixedAbsenceSite = {
            column: character + 1,
            file: relative(root, filePath),
            interfaceName: name,
            line: line + 1,
            propertyName: propName,
            typeText: member.type.getText(sourceFile),
          };

          const key = `${name}.${propName}`;
          if (ALLOWLIST.has(key)) {
            allowlisted.push(site);
          } else {
            violations.push(site);
          }
        }
      }

      if (ts.isTypeAliasDeclaration(node) && node.type) {
        const aliasName = node.name.text;
        if (ts.isTypeLiteralNode(node.type)) {
          visit(node.type, aliasName);
          return;
        }
      }

      ts.forEachChild(node, (child) => visit(child, parentName));
    }

    visit(sourceFile, '');
  }

  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  allowlisted.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return { allowlisted, scannedFiles: sourceFiles.length, violations };
}

const isCheck = process.argv.includes('--check');
const root = resolve(import.meta.dirname, '..');
const report = checkMixedAbsence(root);
const treeState = readGateTreeState(root);

const provenance = formatGateProvenance(
  {
    command: 'npm run mixed-absence:check',
    counting:
      'exported interface properties that are both optional (?:) and nullable (| null), ' +
      'excluding allowlisted dual-sentinel sites',
    scope: 'packages/types/src/**/*.ts (non-test)',
  },
  treeState,
);
process.stdout.write(`${provenance}\n`);

if (report.violations.length === 0 && report.allowlisted.length === 0) {
  process.stdout.write(`${pc.green('OK')} no mixed-absence properties found across ${report.scannedFiles} files\n`);
  process.exit(0);
}

if (report.violations.length > 0) {
  process.stdout.write(
    `\n${pc.yellow(`${report.violations.length} mixed-absence properties`)} ` +
      `(optional + nullable) across ${report.scannedFiles} files:\n\n`,
  );
  for (const site of report.violations) {
    process.stdout.write(
      `  ${pc.dim(`${site.file}:${site.line}`)} ${site.interfaceName}.${pc.yellow(site.propertyName)}: ${pc.dim(site.typeText)}\n`,
    );
  }
}

if (report.allowlisted.length > 0) {
  process.stdout.write(`\n${pc.dim(`${report.allowlisted.length} allowlisted dual-sentinel sites (intentional)`)}\n`);
}

const BASELINE = 105;

process.stdout.write(
  `\nbaseline: ${BASELINE}  current: ${report.violations.length}  allowlisted: ${report.allowlisted.length}\n`,
);

if (report.violations.length > BASELINE) {
  process.stdout.write(
    `\n${pc.red('✗')} mixed-absence count ${report.violations.length} exceeds baseline ${BASELINE}\n` +
      `  New properties must use one absence convention: either optional (?: T) or nullable (T | null), not both.\n` +
      `  If both sentinels carry distinct meaning, add to the allowlist in scripts/check-mixed-absence.ts with a reason.\n`,
  );
  process.exit(1);
}

if (report.violations.length < BASELINE) {
  process.stdout.write(
    `\n${pc.green('✓')} mixed-absence count dropped from ${BASELINE} to ${report.violations.length} — ` +
      `update BASELINE in scripts/check-mixed-absence.ts to ${report.violations.length} to ratchet\n`,
  );
}

if (isCheck && report.violations.length > BASELINE) {
  process.exit(1);
}

process.stdout.write(
  `\n${pc.green('OK')} mixed-absence count ${report.violations.length} within baseline ${BASELINE}\n`,
);
