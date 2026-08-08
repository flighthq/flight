// Sweeps `packages/swf` for places where a SAFE DEFAULT and a MEASURED NEGATIVE are the same value.
//
// THE MECHANISM. `null` because nothing was looked up and `null` because something was looked up and
// found nothing are the same bytes. So are `0` seen-none and `0` never-counted, an absent map key and a
// key holding the empty answer, a no-op catch and a success that wrote nothing. **The representation
// stores the distinction away at WRITE time**, which is why no amount of care at read time recovers it:
// by the time a reader is being careful, the two states are already one value.
//
// ITS ARITY IS NEITHER PER-SITE NOR CROSS-SITE — IT RELATES A WRITE TO A READ. A line-by-line read sees
// one site at a time and cannot see that two writers converge; a discard-shape sweep sees a shape and not
// where its value is later consumed. This sweep names the convergence and still cannot see the consumer,
// so it reports where a distinction was *available to lose*, not where losing it cost anything.
//
// THE CEILING, AND IT IS REAL RATHER THAN FORMULAIC. **A safe default no measurement can produce is
// perfectly fine**, and this sweep cannot tell that case from a genuine collision without reading the
// site: it does not know which values the surrounding logic can actually compute. Every match is a
// candidate. The count below is an upper bound on collisions and a lower bound on nothing.
//
// **THE VOCABULARY IS COMPLETE FOR ITS PREDICATE AND THE PREDICATE IS NARROW.** Given *a default value
// that a measurement could also produce*, the forms below are closed over the ways TypeScript can
// express one. They do not cover a collision spread across two files, or one mediated by a type rather
// than a literal.
//
// AND ITS VOCABULARY IS SEMANTIC, NOT GRAMMAR-DERIVED. The five forms below are shapes I CHOSE as
// collisions, unlike the silent-drop sweep whose forms are closed over a stated predicate. So the ceiling
// this prints bounds what it looked for rather than what exists, and a clean run here is weaker evidence
// than the same-shaped result on a grammatical question. What it excludes is found by asking, not running.
//
// Reports and does not enforce; deliberately absent from `npm run check`.
// Run `npm run capabilities:default-collisions`.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

// Overridable so the detector can be pointed at another corpus WITHOUT changing what this cell's own
// figures measure. A sweep whose default scope moves silently would make every previously reported
// number unreproducible.
const SOURCE_DIRECTORY = process.env.SWEEP_DIR ?? join('packages', 'swf', 'src');
const DISPLAY_CAP = 6;

const FORM_MULTI_CAUSE_SENTINEL = 'one sentinel value returned from several distinct causes';
const FORM_OPTIONAL_PROPERTY = 'optional property: absent and present-but-empty are one state';
const FORM_EMPTY_INIT = 'field initialised to the value a measurement could also write';
const FORM_UNGUARDED_LOOKUP = 'map lookup defaulted without a has() check';
const FORM_SILENT_CATCH = 'catch that writes nothing, indistinguishable from success writing nothing';

const FORMS = [
  FORM_MULTI_CAUSE_SENTINEL,
  FORM_OPTIONAL_PROPERTY,
  FORM_EMPTY_INIT,
  FORM_UNGUARDED_LOOKUP,
  FORM_SILENT_CATCH,
];

interface Match {
  detail: string;
  file: string;
  form: string;
  line: number;
}

const matches: Match[] = [];

function isEmptyValue(node: ts.Node): boolean {
  if (node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword) return true;
  if (ts.isIdentifier(node) && node.text === 'undefined') return true;
  if (ts.isNumericLiteral(node) && (node.text === '0' || node.text === '-1')) return true;
  if (ts.isStringLiteral(node) && node.text === '') return true;
  if (ts.isArrayLiteralExpression(node) && node.elements.length === 0) return true;
  return (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    (node.expression.text === 'Map' || node.expression.text === 'Set')
  );
}

for (const name of readdirSync(SOURCE_DIRECTORY).sort()) {
  if (!name.endsWith('.ts') || name.endsWith('.test.ts') || name.includes('TestHelper')) continue;
  const path = join(SOURCE_DIRECTORY, name);
  const parsed = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);
  const lineOf = (node: ts.Node): number => parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
  const record = (node: ts.Node, form: string, detail: string): void => {
    matches.push({ detail, file: name, form, line: lineOf(node) });
  };

  // The core detector, and the one that is genuinely write-to-read: a function whose sentinel is returned
  // from more than one place. Each `return null` is a DIFFERENT writer cause; the caller receives one
  // value and cannot recover which. One `return null` is unambiguous; several is a collision by
  // construction, whatever the causes happen to be.
  const visitFunctions = (node: ts.Node): void => {
    const body =
      ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)
        ? node.body
        : undefined;
    if (body !== undefined && ts.isBlock(body)) {
      const sentinelReturns: ts.Node[] = [];
      const walk = (inner: ts.Node): void => {
        // Do not descend into a nested function: its returns belong to it, not to this one.
        if (
          inner !== body &&
          (ts.isFunctionDeclaration(inner) || ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))
        ) {
          return;
        }
        if (ts.isReturnStatement(inner) && inner.expression !== undefined && isEmptyValue(inner.expression)) {
          sentinelReturns.push(inner);
        }
        ts.forEachChild(inner, walk);
      };
      walk(body);
      if (sentinelReturns.length > 1) {
        const named = ts.isFunctionDeclaration(node) && node.name !== undefined ? node.name.text : '<anonymous>';
        // THE PRECISION SIGNAL, AND IT IS THE REMEDY ALREADY IN THE TREE: a diagnostic report at a
        // sentinel return is exactly what re-separates two causes the return value merges. A function
        // with as many reports as sentinel returns has resolved its collision; one with none has not.
        // This is why the form is ranked rather than listed flat — the fix is countable.
        const reports = (body.getText(parsed).match(/reportImportDiagnostic\(/g) ?? []).length;
        const state = reports === 0 ? 'UNRESOLVED' : reports >= sentinelReturns.length ? 'resolved' : 'partial';
        record(
          node,
          FORM_MULTI_CAUSE_SENTINEL,
          `${state.padEnd(10)} ${named}: ${sentinelReturns.length} sentinel returns, ${reports} reports`,
        );
      }
    }
    ts.forEachChild(node, visitFunctions);
  };
  visitFunctions(parsed);

  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node) && node.questionToken !== undefined && ts.isIdentifier(node.name)) {
      record(node, FORM_OPTIONAL_PROPERTY, node.name.text);
    }
    if (ts.isPropertyAssignment(node) && isEmptyValue(node.initializer) && ts.isIdentifier(node.name)) {
      record(node, FORM_EMPTY_INIT, `${node.name.text} = ${node.initializer.getText(parsed).slice(0, 24)}`);
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
      /\.get\(/.test(node.left.getText(parsed))
    ) {
      record(node, FORM_UNGUARDED_LOOKUP, node.getText(parsed).split('\n')[0].trim().slice(0, 78));
    }
    // The exemption matches ASSIGNMENT, not the `=` character — a bare `=` alternative also matches
    // `==`, `===`, `!=`, `=>`, and `<=`, which would exempt any catch containing a comparison.
    if (ts.isCatchClause(node) && !/throw|reportImportDiagnostic\(|[^=!<>]=[^=>]/.test(node.block.getText(parsed))) {
      record(node, FORM_SILENT_CATCH, 'catch writes nothing');
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}

const write = (line: string): void => void process.stdout.write(`${line}\n`);
const showAll = process.argv.includes('--all');
let hidden = 0;

const unresolvedSentinels = matches.filter((match) => match.detail.startsWith('UNRESOLVED')).length;
const sentinelTotal = matches.filter((match) => match.form === FORM_MULTI_CAUSE_SENTINEL).length;

write(`${matches.length} candidate default/measured-negative collisions in ${SOURCE_DIRECTORY}`);
write(
  `of which ${unresolvedSentinels} of ${sentinelTotal} multi-cause sentinels report NOTHING at any of their returns`,
);
write('');
write('ARITY: write-to-read. This relates where a value is WRITTEN to where it is READ, which neither a');
write('line-by-line read nor a discard-shape sweep can see. It still cannot see the consumer, so it');
write('reports where a distinction was AVAILABLE TO LOSE, not where losing it cost anything.');
write('CEILING: a safe default no measurement can produce is fine, and this sweep cannot tell that apart');
write('from a real collision without reading the site. EVERY MATCH IS A CANDIDATE.');
write('VOCABULARY is complete for its predicate; the predicate does not reach a collision spread across');
write('two files or mediated by a type rather than a literal.');

for (const form of FORMS) {
  const inForm = matches
    .filter((match) => match.form === form)
    .sort((a, b) =>
      a.detail.startsWith('UNRESOLVED') === b.detail.startsWith('UNRESOLVED')
        ? 0
        : a.detail.startsWith('UNRESOLVED')
          ? -1
          : 1,
    );
  write(`\n${form}: ${inForm.length}`);
  const shown = showAll ? inForm : inForm.slice(0, DISPLAY_CAP);
  for (const match of shown) write(`  ${match.file}:${match.line}  ${match.detail}`);
  if (inForm.length > shown.length) {
    hidden += inForm.length - shown.length;
    write(`  … ${inForm.length - shown.length} more not shown`);
  }
}

// A silently shortened list reads as a complete one, so every truncation says how many it hid.
if (hidden > 0) write(`\n${hidden} of ${matches.length} matches were not printed. Run with --all to see every one.`);
