// Gate: every createFunctionalTarget scene must carry an expectedImageDescription field. Exits nonzero
// when any reachable scene is missing the field. The excluded population (scenes that do not use
// createFunctionalTarget) is described informatively at runtime so the reader can tell whether the
// gate's scope is correct without counting manually.
//
// The unit is load-bearing and is why it is spelled out. An earlier revision of this line read "500+
// scenes", which was the scene-times-renderer CELL count wearing the word "scenes" — the two are 4.5x
// apart and both get called scenes in conversation. A reader sizing this rollout against 500 concludes
// the work is nowhere close when against the right unit it is nearly done, so the denominator error
// changes what someone decides to do, not just what they report.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import ts from 'typescript';

import { discoverEntries } from '../packages/tool-capture/src/captureEntries';
import { functionalScene3DFile } from '../packages/tool-capture/src/functionalScene3Ds';

const scriptPath = fileURLToPath(import.meta.url);

export function findExpectedImageDescriptionCellScope(rootDirectory: string): {
  reachableCells: string[];
  structurallyUnableCells: string[];
} {
  const scenesDirectory = join(rootDirectory, 'functional', 'scenes');
  const reachableCells: string[] = [];
  const structurallyUnableCells: string[] = [];

  for (const entry of discoverEntries('functional', rootDirectory)) {
    for (const renderer of entry.renderers) {
      const file = functionalScene3DFile(scenesDirectory, entry.name, renderer);
      const cells = hasDescriptionCapableCall(readFileSync(file, 'utf8')) ? reachableCells : structurallyUnableCells;
      cells.push(`${entry.name}/${renderer}`);
    }
  }

  return { reachableCells, structurallyUnableCells };
}

export function findScenesWithoutExpectedImageDescription(scenesDirectory: string): string[] {
  return readdirSync(scenesDirectory)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => {
      const content = readFileSync(join(scenesDirectory, f), 'utf8');
      return hasDescriptionCapableCall(content) && !hasNonEmptyDescription(content);
    })
    .map((f) => f.replace(/\.ts$/, ''))
    .sort();
}

export function describeExcludedPopulation(cells: readonly string[]): string {
  if (cells.length === 0) return '0 structurally unable';

  const prefixCounts = new Map<string, number>();
  for (const cell of cells) {
    const name = cell.split('/')[0] ?? '';
    const prefix = name.split('-')[0] ?? '';
    prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
  }

  const sorted = [...prefixCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0];

  if (sorted.length === 1) {
    return `${cells.length} structurally unable — all ${dominant![0]} scenes`;
  }

  const top3 = sorted.slice(0, 3);
  const top3Total = top3.reduce((sum, [, count]) => sum + count, 0);
  const remainder = cells.length - top3Total;
  const parts = top3.map(([prefix, count]) => `${count} ${prefix}`);
  if (remainder > 0) parts.push(`${remainder} other`);

  return `${cells.length} structurally unable (${parts.join(', ')})`;
}

const DESCRIPTION_CAPABLE_CALLS = new Set(['createFunctionalTarget', 'declareExpectedImageDescription']);

function hasDescriptionCapableCall(source: string): boolean {
  const sourceFile = ts.createSourceFile('functional-scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      DESCRIPTION_CAPABLE_CALLS.has(node.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

// The property is STATICALLY-KNOWN NON-EMPTY CONTENT, not a syntax. An earlier revision asserted "a
// non-empty string literal", which names a representation instead — and every description in this repo
// is a `'…' + '…'` concatenation, because describing a picture with coordinate ranges and explicit
// negatives cannot fit the line-width limit any other way. That gate had a 0% true-positive rate: it
// failed all 110 real descriptions and caught no empty one. Ask what the string IS, never how it is spelled.
function getStaticStringLength(node: ts.Node): number {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.trim().length;
  }
  // `a + b` — sum both sides, so a description split across any number of lines reads as its total.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return getStaticStringLength(node.left) + getStaticStringLength(node.right);
  }
  // A template with substitutions: only the static spans are knowable here. Interpolated values are
  // deliberately NOT credited — `${x}` could be empty at runtime, and this gate never executes a scene.
  if (ts.isTemplateExpression(node)) {
    let length = node.head.text.trim().length;
    for (const span of node.templateSpans) length += span.literal.text.trim().length;
    return length;
  }
  if (ts.isParenthesizedExpression(node)) return getStaticStringLength(node.expression);
  return 0;
}

function hasNonEmptyStaticString(node: ts.Node): boolean {
  return getStaticStringLength(node) > 0;
}

function hasNonEmptyDescription(source: string): boolean {
  const sourceFile = ts.createSourceFile('functional-scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (
        node.expression.text === 'declareExpectedImageDescription' &&
        node.arguments.length >= 1 &&
        hasNonEmptyStaticString(node.arguments[0])
      ) {
        found = true;
        return;
      }
      if (node.expression.text === 'createFunctionalTarget' && node.arguments.length >= 1) {
        const arg = node.arguments[0];
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'expectedImageDescription' &&
              hasNonEmptyStaticString(prop.initializer)
            ) {
              found = true;
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function main(): void {
  const isGate = process.argv.includes('--check');
  const root = resolve(dirname(scriptPath), '..');
  const scenesDir = join(root, 'functional', 'scenes');
  const missing = findScenesWithoutExpectedImageDescription(scenesDir);
  const { reachableCells, structurallyUnableCells } = findExpectedImageDescriptionCellScope(root);
  const totalCells = reachableCells.length + structurallyUnableCells.length;

  const excludedDescription = describeExcludedPopulation(structurallyUnableCells);

  console.log(
    `expectedImageDescription: ${reachableCells.length}/${totalCells} cells reachable, ` + `${excludedDescription}\n`,
  );

  // "covered" was the wrong word and it was load-bearing. This gate asks only whether a cell carries
  // non-empty static text; it cannot ask whether that text describes the picture, because the referent is
  // an image and no static check reaches one. Read as "covered", the number rises as the arc completes and
  // therefore reads as PROGRESS — which is what makes it dangerous: a batch of confidently wrong
  // descriptions scores identically to a batch of right ones. A wrong description is worse than a missing
  // one, because it becomes the reference a reviewer compares the render against. Say what is measured.
  if (missing.length === 0) {
    console.log(pc.green(`✓ all ${reachableCells.length} reachable cells carry a non-empty description`));
    console.log(pc.dim('  Non-empty only — whether each describes its picture needs the render beside it.'));
  } else {
    console.log(pc.red(`${missing.length} scene(s) missing expectedImageDescription:`));
    for (const name of missing) console.log(`  ${pc.red('✗')} ${name}`);
    // Open one of the named files before believing this list. On 2026-08-18 this gate reported 110
    // missing and ALL 110 were false positives: the predicate accepted only a single string literal,
    // while every real description is a `'…' + '…'` concatenation. A large count that appears the moment
    // this file changes is a predicate bug; a small count that appears when scenes change is a real gap.
    console.log(pc.dim('\n  Open one named file before acting. A description is a concatenation, not one literal —'));
    console.log(pc.dim('  if the named scene visibly HAS a description, this gate is wrong, not the scene.'));
    if (isGate) process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
