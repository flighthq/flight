// Verifies that every number quoted in the SWF cell's prose docs still matches what recomputing it
// yields.
//
// WHY THIS EXISTS. A number written into a doc is a CACHED VALUE, and a cache with no invalidation check
// is a copy that drifts while looking authoritative. Derivation buys reproducibility, not currency — the
// generated artifacts in this cell are gated for exactly that reason, and the prose that quotes them was
// not. **A number must live where something recomputes it.**
//
// It is not hypothetical here: `individuation.md` shipped "25 of 30" when the measured value was 23,
// caught by re-reading rather than by any instrument. This is that instrument.
//
// WHAT IT CANNOT VERIFY, PRINTED EVERY RUN RATHER THAN OMITTED — AND NARROWED, BECAUSE THE FIRST VERSION
// OF THIS DISCLAIMER CLAIMED MORE IGNORANCE THAN IT HAD. It said the loss-family counts could not be
// checked at all, on the grounds that checking a doc against a parse of the same doc is circular. That
// collapsed two different questions:
//
//   EXTERNAL VALIDITY — are these the right families? — is genuinely unavailable. That is the vocabulary
//   ceiling and it stays.
//   INTERNAL CONSISTENCY — does the stated count match the stated list? — is available and cheap, and is
//   exactly the failure that has bitten this doc three times.
//
// Circular is checking a count against a parse of the same STATEMENT. Deriving the count from the LIST is
// not circular, because the list is the primary artifact and the sentence is a summary of it. So the
// counts below are computed from the table and never typed. A checker that says CANNOT VERIFY where it
// partly can is the same defect one notch quieter than saying OK.
//
// Run `npm run capabilities:numbers` (or `:check`, wired into `npm run check`).
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CELL = join('agents', 'packages', 'swf');

interface Expectation {
  // The literal text the doc must contain. Built from a recomputed value, never written by hand.
  doc: string;
  label: string;
  text: string;
}

function runScript(path: string): string {
  return execFileSync('npx', ['tsx', path], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 });
}

function capture(output: string, pattern: RegExp, label: string): string {
  const match = pattern.exec(output);
  if (match === null) throw new Error(`could not recompute ${label}: output did not match ${String(pattern)}`);
  return match[1];
}

const individuation = runScript(join('scripts', 'swf-individuation.ts'));
const tagDispatch = runScript(join('scripts', 'swf-tag-dispatch.ts'));
const collisions = runScript(join('scripts', 'swf-default-collision.ts'));
const capabilities = JSON.parse(readFileSync(join(CELL, 'capabilities.json'), 'utf8')) as {
  capabilities: unknown[];
};
const instrumentation = JSON.parse(readFileSync(join(CELL, 'instrumentation.json'), 'utf8')) as {
  capabilities: unknown[];
  scopeAudited: number;
};

const declaredCount = String(capabilities.capabilities.length);
const readingA = capture(individuation, /total under reading A \(discriminated\): (\d+)/, 'reading A total');
const readingB = capture(individuation, /total under reading B \(same dispatch arm\): (\d+)/, 'reading B total');
const checkedTags = capture(tagDispatch, /checked (\d+) of \d+ capabilities/, 'tag-dispatch ceiling');
const collisionTotal = capture(collisions, /^(\d+) candidate default/m, 'collision candidates');
const unresolved = capture(collisions, /of which (\d+) of (\d+) multi-cause/, 'unresolved sentinels');
const sentinelTotal = capture(collisions, /of which \d+ of (\d+) multi-cause/, 'sentinel total');

const expectations: Expectation[] = [
  { doc: 'individuation.md', label: 'committed capability count', text: `count is **${declaredCount}**` },
  { doc: 'individuation.md', label: 'reading A total', text: `| A — discriminated | **${readingA}** |` },
  { doc: 'individuation.md', label: 'reading B total', text: `| B — same dispatch arm | **${readingB}** |` },
  { doc: 'individuation.md', label: 'tag-dispatch ceiling', text: `ceiling is ${checkedTags} of ${declaredCount}` },
  { doc: 'individuation.md', label: 'collision candidates', text: `${collisionTotal} candidates` },
  {
    doc: 'individuation.md',
    label: 'unresolved multi-cause sentinels',
    text: `${unresolved} of ${sentinelTotal} multi-cause sentinels`,
  },
  {
    doc: 'loss-path-audit.md',
    label: 'scope-audited rows',
    text: `${instrumentation.scopeAudited} of ${instrumentation.capabilities.length}`,
  },
];

// Numbers in these docs that nothing can independently recompute. Listed so the check's own coverage is
// visible: an unlisted number that also cannot be verified would pass silently.
const UNVERIFIABLE: readonly string[] = [
  'loss-path-audit.md — whether the enumerated families are the RIGHT families (external validity, not internal consistency)',
];

// The loss-family table is the primary artifact; the counts sentence is a summary of it. Rows are the
// unit — one row is one enumerated loss path — and the `#` column groups them into numbered families,
// which is why the row count and the family count differ and both have to be stated.
const auditBody = readFileSync(join(CELL, 'loss-path-audit.md'), 'utf8');
const familyRows = [...auditBody.matchAll(/^\| ([0-9][0-9a-z/]*) \| ([^|]+)\| ([^|]+)\|$/gm)];
if (familyRows.length === 0) throw new Error('could not recompute the loss-family counts: table not found');
const notALoss = familyRows.filter((row) => /demonstrated not reachable/.test(row[3])).length;
const families = new Set(familyRows.map((row) => /^([0-9]+)/.exec(row[1])?.[1])).size;

expectations.push({
  doc: 'loss-path-audit.md',
  label: 'loss-path counts',
  text: `**${familyRows.length} loss paths · ${familyRows.length - notALoss} wired with a fire proof · ${notALoss} demonstrated not-a-loss · 0 unfalsified**, across ${families} numbered families.`,
});

// The consumer contract states the same three populations twice, so both tables are covered rather than
// the first one only. They read `of 82` because the denominator is the declared capability list.
const wiredRows = String(instrumentation.capabilities.length);
for (const label of ['wired', 'fire-proven', 'silence-proven']) {
  expectations.push({
    doc: 'diagnostics.md',
    label: `${label} population`,
    text: `**${wiredRows} of ${declaredCount}**`,
  });
}

// A number nobody maintains is the state this gate exists to fail on. Recomputable numbers are checked
// above; a HISTORICAL one is exempt; anything else is unclassified and fails.
//
// THE TOKEN IS FIXED — one spelling, `HISTORICAL:`, no paraphrase — for the same reason `UNBACKED:` is:
// the point is not that a reader is warned, it is that THE SET IS COUNTABLE. An exemption you cannot
// enumerate is indistinguishable from a gap.
const HISTORICAL_TOKEN = 'HISTORICAL:';
// THE POPULATION IS DERIVED FROM THE TREE, NOT CHOSEN. Three times the hand-picked list missed a doc —
// the status file, the consumer contract, the corpus evidence — and each time the patch was to add a
// file BY HAND, which is choosing again. An instrument whose scope is chosen inherits the bias it was
// built to remove: I derived the count SHAPES from the grammar and picked the FILES from what was in
// front of me. Enumerating the directory means a new document is covered the moment it exists rather
// than when someone remembers it.
//
// Generated docs are excluded because their own generator gates them; including them would report a
// second opinion on a value that is already checked at its source.
const GENERATED_DOCS = new Set(['capabilities.md', 'diagnostic-sites.md']);
const SCANNED_DOCS = readdirSync(CELL)
  .filter((name) => name.endsWith('.md') && !GENERATED_DOCS.has(name))
  .sort();

// Count-shaped: a bolded figure, an `N of M` ratio, or a number followed by a counting noun. Anything
// else in these files — dates, tag codes, byte values, line references — is OUT OF SCOPE, and the ceiling
// printed below says how much that is rather than leaving it implied.
// Comma-grouped digits are one number, not two. Without this the pattern read `53,740 of 53,755` as
// `740 of 53` — a false positive the gate raised against a doc that was correct, which is the failure
// direction that erodes trust in a gate fastest.
const COUNT_SHAPE =
  /\*\*[0-9][0-9,]* (?:of [0-9][0-9,]*)?\*\*|\*\*[0-9][0-9,]*\*\*|\b[0-9][0-9,]* of [0-9][0-9,]*\b|\b[0-9][0-9,]* (?:candidates|rows|sites|families|proofs|loss paths|kinds|forms|matches|capabilities|gates|tests)\b/g;

// A document-level exemption for a doc that is WHOLLY a record of one past run. It is blunter than a
// per-line token and the cost is real and stated rather than discovered: a NEW live-tense number added to
// such a doc is silently exempt. It is used only where every figure has the same provenance, and the
// count it covers is printed so the exemption stays enumerable rather than becoming a blind spot.
const HISTORICAL_DOCUMENT_TOKEN = 'HISTORICAL-DOCUMENT:';

const classified = { historical: 0, historicalDocument: 0, recomputable: 0 };
const unclassified: string[] = [];
// Every numeric token in the scanned docs, so the ceiling below is measured rather than asserted: the
// gate reaches only the count-shaped ones, and the rest are dates, tag codes, byte values and line
// references it makes no claim about.
let numericTokens = 0;

for (const doc of SCANNED_DOCS) {
  const body = readFileSync(join(CELL, doc), 'utf8');
  numericTokens += (body.match(/\b[0-9]+\b/g) ?? []).length;
  const wholeDocumentIsHistorical = body.includes(HISTORICAL_DOCUMENT_TOKEN);
  const lines = body.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const match of line.matchAll(COUNT_SHAPE)) {
      if (expectations.some((expectation) => expectation.text.includes(match[0]))) {
        classified.recomputable++;
      } else if (line.includes(HISTORICAL_TOKEN)) {
        classified.historical++;
      } else if (wholeDocumentIsHistorical) {
        classified.historicalDocument++;
      } else {
        unclassified.push(`${doc}:${index + 1} — "${match[0]}" is live-tense and nothing recomputes it`);
      }
    }
  }
}

const problems: string[] = [];
for (const expectation of expectations) {
  const body = readFileSync(join(CELL, expectation.doc), 'utf8');
  if (!body.includes(expectation.text)) {
    problems.push(`${expectation.doc}: ${expectation.label} — recomputed value expects the text "${expectation.text}"`);
  }
}

for (const entry of unclassified) problems.push(entry);

if (problems.length > 0) {
  process.stderr.write(`✗ doc numbers are stale against recomputation:\n  ${problems.join('\n  ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`OK ${expectations.length} quoted numbers match recomputation\n`);
  const reached = classified.recomputable + classified.historical + classified.historicalDocument;
  process.stdout.write(
    `  count-shaped numbers classified across ${SCANNED_DOCS.length} docs: ${classified.recomputable} recomputable, ${classified.historical} historical, ${classified.historicalDocument} under a whole-document historical marker\n`,
  );
  if (classified.historicalDocument > 0) {
    process.stdout.write(
      '  NOTE: a whole-document marker exempts every figure in that file, including any added later. It is the blunt instrument here and is used only where every figure shares one provenance.\n',
    );
  }
  process.stdout.write(
    `  CEILING: ${reached} of ${numericTokens} numeric tokens in those docs are count-shaped and reached. The other ${numericTokens - reached} are dates, tag codes, byte values and line references, and this gate makes NO claim about them.\n`,
  );
  process.stdout.write(
    '  OUT OF SCOPE: source comments are not scanned, so a format fact like the eight SWF filter ids in swfFilter.ts is unreached. A format fact appearing in a scanned doc would FAIL here and must NOT be marked HISTORICAL — it is recomputable by an external maintainer, and separating it would take its own token.\n',
  );
  for (const entry of UNVERIFIABLE) process.stdout.write(`  not verifiable by any recomputation: ${entry}\n`);
}
