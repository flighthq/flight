// Reporter only — NOT a gate. Exits 0 regardless of how many scenes lack a description. The field is
// optional during rollout (110 functional scenes using createFunctionalTarget); this becomes a gate once
// coverage reaches a threshold worth enforcing, at which point add a process.exitCode and register it in
// scripts/check.ts.
//
// The unit is load-bearing and is why it is spelled out. An earlier revision of this line read "500+
// scenes", which was the scene-times-renderer CELL count wearing the word "scenes" — the two are 4.5x
// apart and both get called scenes in conversation. A reader sizing this rollout against 500 concludes
// the work is nowhere close when against the right unit it is nearly done, so the denominator error
// changes what someone decides to do, not just what they report.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function countScenesWithFunctionalTarget(scenesDirectory: string): number {
  return readdirSync(scenesDirectory)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => hasFunctionalTargetCall(readFileSync(join(scenesDirectory, f), 'utf8'))).length;
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
  const root = resolve(dirname(scriptPath), '..');
  const scenesDir = join(root, 'functional', 'scenes');
  const missing = findScenesWithoutExpectedImageDescription(scenesDir);
  const targetScenes = countScenesWithFunctionalTarget(scenesDir);
  const described = targetScenes - missing.length;
  const { reachableCells, structurallyUnableCells } = findExpectedImageDescriptionCellScope(root);
  const totalCells = reachableCells.length + structurallyUnableCells.length;

  console.log(
    `expectedImageDescription field reachability: ${reachableCells.length}/${totalCells} live cells reachable; ` +
      `${structurallyUnableCells.length}/${totalCells} structurally unable\n`,
  );
  if (structurallyUnableCells.length > 0) {
    console.log(`${structurallyUnableCells.length} structurally unable cell(s):`);
    for (const cell of structurallyUnableCells) console.log(`  - ${cell}`);
    console.log('');
  }

  console.log(
    `expectedImageDescription: ${described}/${targetScenes} createFunctionalTarget scenes have a description\n`,
  );
  if (missing.length > 0) {
    console.log(`${missing.length} scene(s) missing expectedImageDescription:`);
    for (const name of missing) console.log(`  - ${name}`);
  }
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
