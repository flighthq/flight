// Sweeps `packages/swf` for every grammatical form in which a nullish test can guard a use — the shapes
// by which a value is discarded with no signal.
//
// TWO PROPERTIES, AND BOTH MUST BE STATED TOGETHER OR THE OUTPUT LIES BY OMISSION.
//
// **COMPLETE VOCABULARY.** The nine forms below are derived from the TypeScript grammar rather than
// collected from experience, so the form list is closed: given the predicate *a nullish test guards a
// use*, there is no other construct in the language that can express it. A shape this sweep does not know
// about cannot exist. That is the one thing here that IS complete.
//
// **BOUNDED ARITY, WHICH THE COMPLETENESS DOES NOT LIFT.** This is a per-site sweep. It cannot see
// REACHABILITY — the morph path pair in `swfMorphShape.ts` matches perfectly and is not a loss, because
// the two edge streams are read in lockstep and the mismatch its guard declines on cannot arise from SWF
// bytes. And it cannot see a RELATIONAL defect except where one is written as a relation: `DoInitAction`
// declining silently while `DoAction` reported the identical decline was found here only because both
// happened to match form 1. A defect that lives BETWEEN two sites, in neither, is outside this
// instrument's arity no matter how complete its vocabulary is.
//
// **AND THE PREDICATE ITSELF IS NARROWER THAN "DATA LOSS".** A value can be lost with no nullish test
// anywhere: the reused font character id was an unguarded overwrite, and no derivation over this predicate
// reaches it. Complete vocabulary for the predicate is not complete coverage of the harm.
//
// So: A MATCH IS A CANDIDATE, NOT A DEFECT, and A CLEAN RUN IS NOT EVIDENCE THAT NO SILENT DROP REMAINS.
// It reports and does not enforce, and is deliberately absent from `npm run check`.
//
// Run `npm run capabilities:silent-drops`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const SOURCE_DIRECTORY = join('packages', 'swf', 'src');
const STORING_METHODS = new Set(['add', 'push', 'set']);
const EXITING_KINDS = new Set([
  ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.ContinueStatement,
  ts.SyntaxKind.BreakStatement,
]);

// The nine forms, in the order they are derived in the header. `label` is what the output prints.
const FORM_GUARDED_STORE = 'if/no-else guarding a store';
const FORM_GUARDED_EXIT = 'nullish guard that exits (return/continue/break)';
const FORM_TERNARY = 'ternary with a discarding arm';
const FORM_LOGICAL_AND = 'logical-and short circuit as a statement';
const FORM_OPTIONAL_CALL = 'optional call/member short circuit';
const FORM_NULLISH_DEFAULT = 'nullish coalescing supplying a default';
const FORM_OR_DEFAULT = 'logical-or supplying a default';
const FORM_FILTER = 'filter removing nullish members';
const FORM_SWALLOWED_CATCH = 'catch that neither rethrows nor reports';

const FORMS = [
  FORM_GUARDED_STORE,
  FORM_GUARDED_EXIT,
  FORM_TERNARY,
  FORM_LOGICAL_AND,
  FORM_OPTIONAL_CALL,
  FORM_NULLISH_DEFAULT,
  FORM_OR_DEFAULT,
  FORM_FILTER,
  FORM_SWALLOWED_CATCH,
];

interface Match {
  file: string;
  form: string;
  line: number;
  reportsNearby: boolean;
  text: string;
}

function isNullishTest(node: ts.Expression): boolean {
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

function unwrapSingleStatement(statement: ts.Statement): ts.Statement {
  return ts.isBlock(statement) && statement.statements.length === 1 ? statement.statements[0] : statement;
}

function storesValue(statement: ts.Statement): boolean {
  const single = unwrapSingleStatement(statement);
  if (!ts.isExpressionStatement(single)) return false;
  const call = single.expression;
  if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression)) return false;
  return STORING_METHODS.has(call.expression.name.text);
}

function branchExits(statement: ts.Statement): boolean {
  const single = unwrapSingleStatement(statement);
  if (EXITING_KINDS.has(single.kind)) return true;
  return (
    ts.isBlock(single) &&
    single.statements.length > 0 &&
    EXITING_KINDS.has(single.statements[single.statements.length - 1].kind)
  );
}

const matches: Match[] = [];
const files = readdirSync(SOURCE_DIRECTORY)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.includes('TestHelper'))
  .sort();

for (const name of files) {
  const path = join(SOURCE_DIRECTORY, name);
  const text = readFileSync(path, 'utf8');
  const parsed = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);

  const record = (node: ts.Node, form: string): void => {
    const start = node.getStart(parsed);
    // "Nearby" is a 1200-character window, not scope analysis: it separates a site whose surroundings
    // already report from one that does not. It is a hint for a reader, never a verdict.
    const surrounding = text.slice(Math.max(0, start - 1200), node.getEnd());
    matches.push({
      file: name,
      form,
      line: parsed.getLineAndCharacterOfPosition(start).line + 1,
      reportsNearby: surrounding.includes('reportImportDiagnostic('),
      text: node.getText(parsed).split('\n')[0].trim().slice(0, 108),
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && isNullishTest(node.expression)) {
      if (node.elseStatement === undefined && storesValue(node.thenStatement)) record(node, FORM_GUARDED_STORE);
      else if (node.elseStatement === undefined && branchExits(node.thenStatement)) record(node, FORM_GUARDED_EXIT);
    }
    if (ts.isConditionalExpression(node) && isNullishTest(node.condition)) {
      const arms = [node.whenTrue, node.whenFalse];
      if (
        arms.some((arm) => arm.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(arm) && arm.text === 'undefined'))
      ) {
        record(node, FORM_TERNARY);
      }
    }
    if (
      ts.isExpressionStatement(node) &&
      ts.isBinaryExpression(node.expression) &&
      node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      isNullishTest(node.expression.left)
    ) {
      record(node, FORM_LOGICAL_AND);
    }
    if (ts.isExpressionStatement(node) && /\?\./.test(node.getText(parsed))) record(node, FORM_OPTIONAL_CALL);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      record(node, FORM_NULLISH_DEFAULT);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      // Only a `||` supplying a VALUE is a substitution; one inside a condition is ordinary control flow.
      const parent = node.parent as ts.Node | undefined;
      if (
        parent !== undefined &&
        (ts.isVariableDeclaration(parent) || ts.isReturnStatement(parent) || ts.isPropertyAssignment(parent))
      ) {
        record(node, FORM_OR_DEFAULT);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'filter'
    ) {
      if (node.arguments.length === 1 && /null|undefined|Boolean/.test(node.arguments[0].getText(parsed))) {
        record(node, FORM_FILTER);
      }
    }
    if (ts.isCatchClause(node)) {
      const body = node.block.getText(parsed);
      if (!/throw|reportImportDiagnostic\(/.test(body)) record(node, FORM_SWALLOWED_CATCH);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

const write = (line: string): void => void process.stdout.write(`${line}\n`);

write(`${matches.length} matches across ${FORMS.length} grammatical forms in ${SOURCE_DIRECTORY}`);
write('');
write('VOCABULARY IS COMPLETE — the nine forms are derived from the grammar, so no unknown shape exists');
write('for the predicate "a nullish test guards a use".');
write('ARITY IS BOUNDED — this is per-site. It cannot see whether a match is REACHABLE, and it cannot see');
write('a defect that lives BETWEEN two sites rather than in either. Completeness of vocabulary does not');
write('lift that, and neither bound subsumes the other.');
write('THE PREDICATE IS NARROWER THAN DATA LOSS — an unguarded overwrite has no nullish test at all.');
write('A MATCH IS A CANDIDATE, NOT A DEFECT. A CLEAN RUN IS NOT EVIDENCE THAT NO SILENT DROP REMAINS.');

// Display is capped per form so the output stays readable; the CAP IS ON PRINTING, NEVER ON THE SWEEP,
// and every truncation says how many it hid. A silently shortened list reads as a complete one, which is
// the same substitution this whole script exists to refuse.
const showAll = process.argv.includes('--all');
const DISPLAY_CAP = 8;
let hidden = 0;

for (const form of FORMS) {
  const inForm = matches.filter((match) => match.form === form);
  const unreported = inForm.filter((match) => !match.reportsNearby).length;
  write(`\n${form}: ${inForm.length} (${unreported} with no report nearby)`);
  const shown = showAll ? inForm : inForm.slice(0, DISPLAY_CAP);
  for (const match of shown) {
    write(`  ${match.file}:${match.line}${match.reportsNearby ? ' [reports nearby]' : ''}`);
    write(`    ${match.text}`);
  }
  if (inForm.length > shown.length) {
    hidden += inForm.length - shown.length;
    write(`  … ${inForm.length - shown.length} more not shown`);
  }
}

if (hidden > 0) write(`\n${hidden} of ${matches.length} matches were not printed. Run with --all to see every one.`);
