// Cross-checks the declared SWF capability list against the tags the importer actually dispatches on.
//
// THIS REPORTS AND DOES NOT ENFORCE, ON PURPOSE, AND THAT IS NOT TIMIDITY. It is deliberately absent from
// `npm run check`. A gate that fails the build states that its checked set is the set that matters, and
// this one's checked set is barely half the capability list — see the ceiling it prints. Enforcing it
// would convert "the half we can see is consistent" into "the list is consistent", which is the exact
// substitution the capability work exists to remove.
//
// THE CEILING IS THE POINT AND IT IS PRINTED EVERY RUN. Only capabilities whose identity is a TAG can be
// checked this way. Everything individuated by a fill kind, a stroke property, a placement flag bit or a
// backend axis is invisible here, and a clean run says nothing whatsoever about them. The number is
// measured on each run rather than written down, so it cannot go stale while looking authoritative.
//
// WHAT IT CAN ACTUALLY CATCH, which is why it is worth having at all: a capability row naming a tag the
// importer never dispatches on (a claim with no code behind it), and a tag constant declared but never
// referenced (code with no claim). Both are silent today.
//
// Run `npm run capabilities:tag-dispatch`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const SWF_DOCUMENT_PATH = join('packages', 'swf', 'src', 'swfDocument.ts');
const CAPABILITIES_PATH = join('agents', 'packages', 'swf', 'capabilities.json');
const TAG_CONSTANT_PATTERN = /^TAG_[A-Z0-9_]+$/;

// Capability ids use British spelling and the format's tag constants use American. This normalisation is
// the one hand-maintained part left in the join, and a divergence it does not cover fails SILENTLY as an
// out-of-scope row rather than as an error. It is named here because a mechanical-looking rule hides its
// manual joint better than an obviously manual one does.
function normaliseSpelling(text: string): string {
  return text.replace(/colour/g, 'color');
}

function tagToSlug(tag: string): string {
  return normaliseSpelling(tag.replace(/^TAG_/, '').toLowerCase().replace(/_/g, '-'));
}

const source = ts.createSourceFile(
  SWF_DOCUMENT_PATH,
  readFileSync(SWF_DOCUMENT_PATH, 'utf8'),
  ts.ScriptTarget.ES2022,
  true,
);

const declaredTags = new Set<string>();
const dispatchedTags = new Set<string>();
// Tags the importer routes by numeric literal through the declined-tag maps rather than by a `TAG_*`
// constant. Extracted from the map literals rather than listed by hand: a hand list is a second place to
// forget, and this one is the same shape as the code it describes.
const declinedCapabilities = new Set<string>();

function visit(node: ts.Node): void {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    TAG_CONSTANT_PATTERN.test(node.name.text) &&
    node.initializer !== undefined &&
    ts.isNumericLiteral(node.initializer)
  ) {
    declaredTags.add(node.name.text);
  }

  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'SWF_DECLINED_TAG_CAPABILITIES'
  ) {
    const literals: string[] = [];
    const collect = (inner: ts.Node): void => {
      if (ts.isStringLiteral(inner)) literals.push(inner.text);
      ts.forEachChild(inner, collect);
    };
    collect(node);
    for (const id of literals) declinedCapabilities.add(id);
  }

  // A tag is "dispatched on" when its value participates in a decision: an equality comparison or a
  // switch case. A constant that is only declared, or only stored in a table, is not dispatch.
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
  ) {
    for (const side of [node.left, node.right]) {
      if (ts.isIdentifier(side) && TAG_CONSTANT_PATTERN.test(side.text)) dispatchedTags.add(side.text);
    }
  }
  if (ts.isCaseClause(node) && ts.isIdentifier(node.expression) && TAG_CONSTANT_PATTERN.test(node.expression.text)) {
    dispatchedTags.add(node.expression.text);
  }

  ts.forEachChild(node, visit);
}
visit(source);

const declared = JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8')) as { capabilities: { id: string }[] };
const slugToTag = new Map<string, string>();
for (const tag of declaredTags) slugToTag.set(tagToSlug(tag), tag);

// The leading token of each declared tag slug (`define`, `place`, `do`, …). A row whose slug starts with
// one of these looks like a tag claim, and is reported separately when it matches no tag.
const declaredTagSlugPrefixes = [...new Set([...declaredTags].map((tag) => `${tagToSlug(tag).split('-')[0]}-`))];

const checked: string[] = [];
const unmatchedTagShaped: string[] = [];
const outOfScope: string[] = [];
const claimedButNeverDispatched: string[] = [];

for (const row of declared.capabilities) {
  if (declinedCapabilities.has(row.id)) {
    checked.push(row.id);
    continue;
  }
  const slug = normaliseSpelling(row.id.split('.').slice(2).join('.'));
  const tag = slugToTag.get(slug);
  if (tag === undefined) {
    // A row that matches no tag is USUALLY a capability individuated by something other than a tag, which
    // this check is simply blind to. But it is also where a row naming a tag that does not exist would
    // land — a claim with no code behind it, filed under "not my business". The two are indistinguishable
    // from the id alone, so the resembling ones are surfaced instead of silently bucketed.
    if (declaredTagSlugPrefixes.some((prefix) => slug.startsWith(prefix))) unmatchedTagShaped.push(row.id);
    else outOfScope.push(row.id);
    continue;
  }
  if (!dispatchedTags.has(tag)) {
    claimedButNeverDispatched.push(`${row.id} -> ${tag}`);
    continue;
  }
  checked.push(row.id);
}

const declaredButNeverDispatched = [...declaredTags].filter((tag) => !dispatchedTags.has(tag)).sort();
const dispatchedWithoutRow = [...dispatchedTags]
  .filter(
    (tag) =>
      ![...slugToTag.entries()].some(
        ([slug, t]) =>
          t === tag &&
          declared.capabilities.some((r) => normaliseSpelling(r.id.split('.').slice(2).join('.')) === slug),
      ),
  )
  .sort();

const total = declared.capabilities.length;
const write = (line: string): void => void process.stdout.write(`${line}\n`);

write(`checked ${checked.length} of ${total} capabilities against tag dispatch`);
write(`out of scope ${outOfScope.length} of ${total} — not identified by a tag, so this check is blind to them`);
if (unmatchedTagShaped.length > 0) {
  write(
    `\nCHECK BY HAND — rows whose id reads like a tag claim but matches no declared tag (${unmatchedTagShaped.length}):`,
  );
  for (const id of unmatchedTagShaped) write(`  ${id}`);
  write('  These cannot be told apart from a non-tag capability mechanically. Either is possible.');
}
write(`CEILING: this check can never see more than ${checked.length + claimedButNeverDispatched.length} of ${total}.`);
write('A clean run says nothing about the rest. It is not evidence that they are consistent.');

if (claimedButNeverDispatched.length > 0) {
  write(
    `\nDEFECT — capability rows naming a tag the importer never dispatches on (${claimedButNeverDispatched.length}):`,
  );
  for (const entry of claimedButNeverDispatched) write(`  ${entry}`);
} else {
  write('\nno capability row names a tag the importer never dispatches on');
}

if (declaredButNeverDispatched.length > 0) {
  write(`\nDEFECT — tag constants declared but never dispatched on (${declaredButNeverDispatched.length}):`);
  for (const tag of declaredButNeverDispatched) write(`  ${tag}`);
} else {
  write('no tag constant is declared without being dispatched on');
}

// Informational, not a defect: some are structural (End, ShowFrame) and some are the grain disagreement
// where a row individuates by pixel format rather than by tag. Neither is a missing capability.
write(
  `\ntags dispatched on with no capability row (${dispatchedWithoutRow.length}) — structural or grain disagreement:`,
);
write(`  ${dispatchedWithoutRow.join(', ')}`);
