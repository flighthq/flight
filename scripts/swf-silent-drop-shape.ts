// Finds the house-style shape that hides a silent drop: a null check whose success branch stores a value
// and whose failure branch does nothing at all.
//
//     if (x !== null) collection.set(id, x);          // the failure case vanishes with no signal
//
// THIS REPORTS AND DOES NOT ENFORCE, AND THE REASON IS A MEASURED ONE RATHER THAN CAUTION. Wiring the
// eleven loss families turned up a match — the morph path pair in `swfMorphShape.ts` — that is NOT a loss:
// the two edge streams are read in lockstep, so the mismatch its guard declines on cannot arise from SWF
// bytes. It matched the shape perfectly and reported nothing real. **A MATCH IS A CANDIDATE, NOT A
// DEFECT**, and a rule that failed the build on this shape would have demanded a wire for a branch nothing
// can reach.
//
// THE CEILING, AND IT CUTS BOTH WAYS. A syntactic sweep finds syntax, not losses. It over-reports guards
// that cannot fire, and it equally MISSES any silent drop written in a shape it does not match — an early
// `return`, a `continue`, a ternary, a value quietly replaced rather than skipped. The reused font
// character id was found by looking for a store with no duplicate guard, which this sweep cannot see at
// all. **A CLEAN RUN IS NOT EVIDENCE THAT NO SILENT DROP REMAINS.**
//
// Run `npm run capabilities:silent-drops`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const SOURCE_DIRECTORY = join('packages', 'swf', 'src');
const STORING_METHODS = new Set(['add', 'push', 'set']);

interface Match {
  file: string;
  line: number;
  reportsInBranch: boolean;
  text: string;
}

function isNullishComparison(node: ts.Expression): boolean {
  if (!ts.isBinaryExpression(node)) return false;
  const operator = node.operatorToken.kind;
  if (operator !== ts.SyntaxKind.ExclamationEqualsEqualsToken && operator !== ts.SyntaxKind.EqualsEqualsEqualsToken) {
    return false;
  }
  for (const side of [node.left, node.right]) {
    if (side.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isIdentifier(side) && side.text === 'undefined') return true;
  }
  return false;
}

// The success branch is a store when its only statement calls `.set`, `.push` or `.add` on something.
function storesValue(statement: ts.Statement): boolean {
  const single = ts.isBlock(statement) && statement.statements.length === 1 ? statement.statements[0] : statement;
  if (!ts.isExpressionStatement(single)) return false;
  const call = single.expression;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
  return STORING_METHODS.has(call.expression.name.text);
}

const matches: Match[] = [];
const files = readdirSync(SOURCE_DIRECTORY)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.includes('TestHelper'))
  .sort();

for (const name of files) {
  const path = join(SOURCE_DIRECTORY, name);
  const text = readFileSync(path, 'utf8');
  const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && node.elseStatement === undefined && isNullishComparison(node.expression)) {
      if (storesValue(node.thenStatement)) {
        const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
        // A match whose enclosing function already reports is far more likely to be deliberate, so the
        // two are separated rather than pooled. This is a hint for a reader, not a verdict.
        const enclosing = text.slice(Math.max(0, node.getStart(parsed) - 1200), node.getEnd());
        matches.push({
          file: name,
          line,
          reportsInBranch: enclosing.includes('reportImportDiagnostic('),
          text: node.getText(parsed).split('\n')[0].trim(),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

const write = (line: string): void => void process.stdout.write(`${line}\n`);
const unreported = matches.filter((match) => !match.reportsInBranch);

write(`${matches.length} matches of the silent-drop shape in ${SOURCE_DIRECTORY}`);
write(`${unreported.length} with no reportImportDiagnostic call nearby`);
write('A MATCH IS A CANDIDATE, NOT A DEFECT. One known match guards a branch that cannot be reached.');
write('A clean run is not evidence that no silent drop remains: this sweep cannot see an early return, a');
write('continue, a ternary, or a value replaced rather than skipped.');

if (matches.length === 0) {
  write('\nno matches');
} else {
  write('');
  for (const match of matches) {
    write(`  ${match.file}:${match.line}${match.reportsInBranch ? ' [reports nearby]' : ''}`);
    write(`    ${match.text}`);
  }
}
