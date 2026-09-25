import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import pc from 'picocolors';
import ts from 'typescript';

import { formatGateProvenance, readGateTreeState } from './gate-provenance.ts';

export interface DoubleCastSite {
  readonly column: number;
  readonly file: string;
  readonly line: number;
  readonly targetType: string;
  readonly text: string;
}

export interface DoubleCastReport {
  readonly scannedFiles: number;
  readonly sites: readonly DoubleCastSite[];
}

export function createEmptyDoubleCastReport(): DoubleCastReport {
  return { scannedFiles: 0, sites: [] };
}

function collectPackageSourceFiles(root: string): string[] {
  const packagesDir = resolve(root, 'packages');
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.claude') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        files.push(full);
      }
    }
  }
  walk(packagesDir);
  return files;
}

function isAsUnknownAsX(node: ts.AsExpression): string | null {
  if (!ts.isAsExpression(node.expression)) return null;
  const inner = node.expression;
  if (inner.type.kind !== ts.SyntaxKind.UnknownKeyword) return null;
  return node.type.getText();
}

export function checkDoubleCasts(root: string): DoubleCastReport {
  const sourceFiles = collectPackageSourceFiles(root);
  const sites: DoubleCastSite[] = [];

  for (const filePath of sourceFiles) {
    const text = readFileSync(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node): void {
      if (ts.isAsExpression(node)) {
        const targetType = isAsUnknownAsX(node);
        if (targetType !== null) {
          const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          sites.push({
            column: character + 1,
            file: relative(root, filePath),
            line: line + 1,
            targetType,
            text: node.getText(sourceFile).slice(0, 120),
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  sites.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { scannedFiles: sourceFiles.length, sites };
}

const root = resolve(import.meta.dirname, '..');
const report = checkDoubleCasts(root);
const treeState = readGateTreeState(root);

const provenance = formatGateProvenance(
  {
    command: 'npm run double-casts:check',
    counting:
      '`as unknown as X` expressions in SDK package source (non-test, non-declaration). ' +
      'Each is an explicit abandonment of type checking that should carry a comment naming the constraint.',
    scope: 'packages/*/src/**/*.ts (non-test, non-declaration)',
  },
  treeState,
);
process.stdout.write(`${provenance}\n`);

if (report.sites.length === 0) {
  process.stdout.write(`${pc.green('OK')} no double casts found across ${report.scannedFiles} files\n`);
  process.exit(0);
}

process.stdout.write(
  `\n${pc.yellow(`${report.sites.length} double casts`)} (as unknown as X) across ${report.scannedFiles} files:\n\n`,
);
for (const site of report.sites) {
  process.stdout.write(`  ${pc.dim(`${site.file}:${site.line}`)} → ${pc.yellow(site.targetType)}\n`);
}

const BASELINE = 196;

process.stdout.write(`\nbaseline: ${BASELINE}  current: ${report.sites.length}\n`);

if (report.sites.length > BASELINE) {
  process.stdout.write(
    `\n${pc.red('✗')} double-cast count ${report.sites.length} exceeds baseline ${BASELINE}\n` +
      `  \`as unknown as X\` bypasses the type system entirely. Use a narrower assertion,\n` +
      `  a type guard, or a checked recovery function instead.\n`,
  );
  process.exit(1);
}

if (report.sites.length < BASELINE) {
  process.stdout.write(
    `\n${pc.green('✓')} double-cast count dropped from ${BASELINE} to ${report.sites.length} — ` +
      `update BASELINE in scripts/check-double-casts.ts to ${report.sites.length} to ratchet\n`,
  );
}

process.stdout.write(`\n${pc.green('OK')} double-cast count ${report.sites.length} within baseline ${BASELINE}\n`);
