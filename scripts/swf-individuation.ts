// Applies a candidate individuation rule to `capabilities.json` and reports the count it actually
// yields. This is a MEASUREMENT INSTRUMENT, not a gate: it is deliberately absent from `npm run check`
// because no reading below is ratified, and a gate would harden a number nobody has agreed on.
//
// WHY IT EXISTS. A count with no stated individuation rule is a tally, not a measurement: 82 was never
// wrong, it was never defined, because nothing said when two things are one row instead of two. The
// candidate rule is "routes distinctly" — if the importer routes two tag codes differently, they are two
// things the importer does. That phrase is itself under-defined, so this script implements the two
// readings it can bear and prints both totals rather than electing one.
//
// WHAT IT FOUND, AND WHY THAT MATTERS MORE THAN EITHER NUMBER. Reading A is not stable under a
// behaviour-preserving refactor: rewriting `resolveSwfShapeVersion`'s if-chain as an equivalent `Map`
// lookup collapses the four DefineShape versions into one and lowers the total, with no change to what
// the importer does. The measured pair is in `agents/packages/swf/individuation.md`, stamped, because it
// came from a modified tree that no longer exists and nothing here can recompute it. A rule whose
// denominator moves when only the source style moves is
// measuring the source, not the importer. Reading B is stable under that rewrite but coarse enough to
// call shapes, text, morph shapes, and edit text a single capability. Neither is ratifiable as it
// stands; `agents/packages/swf/individuation.md` carries the full result.
//
// Run `npx tsx ./scripts/swf-individuation.ts` (or `npm run capabilities:individuation`).
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

// Tags the importer routes by numeric literal in a Map rather than through a `TAG_*` constant. A
// constant-based extractor cannot see these at all, so without this table they are silently miscounted
// as "not tag-shaped" — which is a wrong breakdown, not merely a missing row. THIS TABLE IS THE PART
// THAT DRIFTS: it is hand-maintained, and nothing detects a new literal-routed tag appearing.
const LITERAL_ROUTED_ROWS = new Map<string, string>([['swf.video.video-frame', 'literal:61']]);

const SWF_SOURCE_DIRECTORY = process.env.SWF_SRC ?? 'packages/swf/src';
const TAG_CONSTANT_PATTERN = /^TAG_[A-Z0-9_]+$/;

// Capability ids use British spelling; the format's tag constants use American. The name join is only
// as good as this normalisation, and a future divergence it does not cover fails silently as a
// "non-tag-shaped" row.
function normaliseSpelling(text: string): string {
  return text.replace(/colour/g, 'color');
}

// A decision group is the maximal boolean expression a comparison participates in: walk up through
// `||`, `&&`, and parentheses. Two tags sharing a group are indistinguishable AT THAT SITE.
function resolveDecisionGroup(node: ts.Node): ts.Node {
  let current = node;
  for (;;) {
    const parent = current.parent as ts.Node | undefined;
    if (parent === undefined) return current;
    if (ts.isParenthesizedExpression(parent)) {
      current = parent;
      continue;
    }
    const isBooleanJoin =
      ts.isBinaryExpression(parent) &&
      (parent.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken);
    if (!isBooleanJoin) return current;
    current = parent;
  }
}

function collectTagIdentifiers(node: ts.Node, out: string[]): void {
  if (ts.isIdentifier(node) && TAG_CONSTANT_PATTERN.test(node.text)) out.push(node.text);
  ts.forEachChild(node, (child) => collectTagIdentifiers(child, out));
}

// READING A — "discriminated": two tag codes are one capability iff no decision anywhere in the
// package ever mentions one without the other.
function measureDiscriminatedClasses(): Map<string, Set<string>> {
  const signatures = new Map<string, Set<string>>();
  const sourceFiles = readdirSync(SWF_SOURCE_DIRECTORY)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => join(SWF_SOURCE_DIRECTORY, name));
  for (const path of sourceFiles) {
    const parsed = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);
    const visit = (node: ts.Node): void => {
      const isEquality =
        ts.isBinaryExpression(node) &&
        (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken);
      if (isEquality) {
        const comparison = node as ts.BinaryExpression;
        for (const side of [comparison.left, comparison.right]) {
          if (!ts.isIdentifier(side) || !TAG_CONSTANT_PATTERN.test(side.text)) continue;
          const group = resolveDecisionGroup(comparison);
          const set = signatures.get(side.text) ?? new Set<string>();
          set.add(`${path}:${group.pos}:${group.end}`);
          signatures.set(side.text, set);
        }
      }
      if (
        ts.isCaseClause(node) &&
        ts.isIdentifier(node.expression) &&
        TAG_CONSTANT_PATTERN.test(node.expression.text)
      ) {
        const set = signatures.get(node.expression.text) ?? new Set<string>();
        set.add(`${path}:case:${node.pos}`);
        signatures.set(node.expression.text, set);
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
  return signatures;
}

// READING B — "same dispatch arm": two tag codes are one capability iff they enter the same arm of the
// tag loop, with predicate helpers inlined one hop.
function measureDispatchArmClasses(): string[][] {
  const path = join(SWF_SOURCE_DIRECTORY, 'swfDocument.ts');
  const parsed = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2022, true);
  const predicateTags = new Map<string, string[]>();
  const visitDeclarations = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
      const tags: string[] = [];
      collectTagIdentifiers(node.body, tags);
      if (tags.length > 0) predicateTags.set(node.name.text, [...new Set(tags)]);
    }
    ts.forEachChild(node, visitDeclarations);
  };
  visitDeclarations(parsed);

  const arms: string[][] = [];
  const visitConditions = (node: ts.Node): void => {
    if (ts.isIfStatement(node)) {
      const tags: string[] = [];
      collectTagIdentifiers(node.expression, tags);
      const findCalls = (inner: ts.Node): void => {
        if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression)) {
          const viaPredicate = predicateTags.get(inner.expression.text);
          if (viaPredicate !== undefined) tags.push(...viaPredicate);
        }
        ts.forEachChild(inner, findCalls);
      };
      findCalls(node.expression);
      if (tags.length > 0) arms.push([...new Set(tags)]);
    }
    ts.forEachChild(node, visitConditions);
  };
  visitConditions(parsed);
  return arms;
}

function groupByEquivalence(members: Iterable<string>, keyOf: (member: string) => string): Map<string, string[]> {
  const classes = new Map<string, string[]>();
  for (const member of members) {
    const key = keyOf(member);
    const list = classes.get(key) ?? [];
    list.push(member);
    classes.set(key, list);
  }
  return classes;
}

const signatures = measureDiscriminatedClasses();
const comparedConstantCount = signatures.size;
for (const literal of LITERAL_ROUTED_ROWS.values()) signatures.set(literal, new Set([literal]));

const discriminatedClasses = groupByEquivalence(signatures.keys(), (tag) =>
  [...(signatures.get(tag) as Set<string>)].sort().join('|'),
);

const armRoot = new Map<string, string>();
const findRoot = (tag: string): string => {
  let root = tag;
  for (;;) {
    const next = armRoot.get(root);
    if (next === undefined || next === root) return root;
    root = next;
  }
};
for (const arm of measureDispatchArmClasses()) {
  for (const tag of arm) if (!armRoot.has(tag)) armRoot.set(tag, tag);
  for (const tag of arm.slice(1)) armRoot.set(findRoot(tag), findRoot(arm[0]));
}
for (const literal of LITERAL_ROUTED_ROWS.values()) armRoot.set(literal, literal);
const dispatchArmClasses = groupByEquivalence(armRoot.keys(), findRoot);

const declared = JSON.parse(readFileSync(join('agents', 'packages', 'swf', 'capabilities.json'), 'utf8')) as {
  capabilities: { id: string }[];
};
const slugToTag = new Map<string, string>();
for (const tag of signatures.keys()) {
  slugToTag.set(normaliseSpelling(tag.replace(/^TAG_/, '').toLowerCase().replace(/_/g, '-')), tag);
}
const rowTag = new Map<string, string>();
const rowsWithoutTag: string[] = [];
for (const row of declared.capabilities) {
  const trailing = row.id.split('.').slice(2).join('.');
  const tag = slugToTag.get(normaliseSpelling(trailing)) ?? LITERAL_ROUTED_ROWS.get(row.id);
  if (tag === undefined) rowsWithoutTag.push(row.id);
  else rowTag.set(row.id, tag);
}

function reportTotal(label: string, classes: Map<string, string[]>): void {
  const classOfTag = new Map<string, string>();
  for (const [key, members] of classes) for (const member of members) classOfTag.set(member, key);
  const distinct = new Set<string>();
  for (const tag of rowTag.values()) distinct.add(classOfTag.get(tag) ?? tag);
  const total = rowsWithoutTag.length + distinct.size;
  process.stdout.write(`${label}: ${total} (${rowsWithoutTag.length} non-tag rows + ${distinct.size} tag classes)\n`);
}

function reportMerges(label: string, classes: Map<string, string[]>): void {
  process.stdout.write(`${label} — classes with more than one member:\n`);
  for (const members of classes.values()) {
    if (members.length > 1) process.stdout.write(`  ${[...members].sort().join(' + ')}\n`);
  }
}

const tagsWithoutRow = [...signatures.keys()].filter((tag) => ![...rowTag.values()].includes(tag)).sort();

process.stdout.write(
  `tag constants the importer compares: ${comparedConstantCount} (+${LITERAL_ROUTED_ROWS.size} routed by numeric literal)\n`,
);
reportMerges('reading A (discriminated)', discriminatedClasses);
reportMerges('reading B (same dispatch arm)', dispatchArmClasses);
process.stdout.write(`\nrows joined to a tag: ${rowTag.size} of ${declared.capabilities.length}\n`);
// A tag with no row is the grain disagreement, not an omission: DefineBitsLossless is covered by four
// rows keyed on pixel format, and End/ShowFrame/JPEGTables are structural rather than capabilities.
process.stdout.write(`tags with no row (grain disagreement or structural): ${tagsWithoutRow.join(', ')}\n\n`);
reportTotal('total under reading A (discriminated)', discriminatedClasses);
reportTotal('total under reading B (same dispatch arm)', dispatchArmClasses);
process.stdout.write(`committed count: ${declared.capabilities.length}\n`);
