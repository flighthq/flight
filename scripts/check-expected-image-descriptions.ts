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
      const cells = hasFunctionalTargetCall(readFileSync(file, 'utf8')) ? reachableCells : structurallyUnableCells;
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
      return hasFunctionalTargetCall(content) && !content.includes('expectedImageDescription');
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

function hasFunctionalTargetCall(source: string): boolean {
  const sourceFile = ts.createSourceFile('functional-scene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createFunctionalTarget'
    ) {
      found = true;
      return;
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

  if (missing.length === 0) {
    console.log(pc.green(`✓ all ${reachableCells.length} reachable cells covered`));
  } else {
    console.log(pc.red(`${missing.length} scene(s) missing expectedImageDescription:`));
    for (const name of missing) console.log(`  ${pc.red('✗')} ${name}`);
    if (isGate) process.exitCode = 1;
  }
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
