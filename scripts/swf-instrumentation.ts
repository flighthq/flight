// The capability→proof mapping the conformance scoreboard reads: which declared SWF capabilities have a
// test proving their loss paths FIRE, and a test proving they STAY SILENT when nothing is lost.
//
// WHY BOTH ROLES, AND WHY A ROW WITHOUT BOTH IS NOT EMITTED AT ALL. A wire nobody has seen fire is a gate
// nobody has seen fail. A wire that fires on every import corrupts the outcome counts underneath the
// score and looks like signal, which is worse. So a capability is countable only with both proofs, and
// this generator omits any row missing either — an uninstrumented capability is not forbidden from the
// mapping, it is UNREPRESENTABLE in it, and the consumer reads its absence as UNKNOWN.
//
// WHY THIS IS GENERATED RATHER THAN HAND-MAINTAINED. The same three counts lived in a prose table for one
// afternoon and were wrong by the end of it: a claim true of one batch was restated as a property of the
// whole set. The declaration below is checked against the tests that must exist and the capability ids
// that must be declared, so the same error fails the build instead of shipping.
//
// Run `npm run instrumentation` to regenerate; `npm run instrumentation:check` (wired into `npm run
// check`) fails if the committed artifact is stale or any named proof has gone missing.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SwfInstrumentation {
  fires: readonly string[];
  id: string;
  staysSilent: readonly string[];
}

// Proof identifiers are test names, verbatim. A renamed or deleted test breaks the check rather than
// silently degrading the mapping, which is the property that makes the artifact trustworthy.
const INSTRUMENTATION: readonly SwfInstrumentation[] = [
  {
    fires: ['reports a gradient glow angle and distance it cannot represent, and stays silent without them'],
    id: 'swf.placement.filter-list',
    staysSilent: ['reports a gradient glow angle and distance it cannot represent, and stays silent without them'],
  },
];

const REPO_ROOT = join(import.meta.dirname, '..');
const CELL_DIR = join(REPO_ROOT, 'agents', 'packages', 'swf');
const ARTIFACT_PATH = join(CELL_DIR, 'instrumentation.json');
const CAPABILITIES_PATH = join(CELL_DIR, 'capabilities.json');
const SOURCE_DIR = join(REPO_ROOT, 'packages', 'swf', 'src');

function readTestNames(): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(SOURCE_DIR)) {
    if (!file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(SOURCE_DIR, file), 'utf8');
    for (const match of source.matchAll(/\bit\(\s*(['"])(.*?)\1/gs)) names.add(match[2]);
  }
  return names;
}

export function verifySwfInstrumentation(): string[] {
  const problems: string[] = [];
  const declared = new Set<string>(
    (JSON.parse(readFileSync(CAPABILITIES_PATH, 'utf8')) as { capabilities: { id: string }[] }).capabilities.map(
      (capability) => capability.id,
    ),
  );
  const tests = readTestNames();
  const seen = new Set<string>();

  for (const entry of INSTRUMENTATION) {
    if (seen.has(entry.id)) problems.push(`duplicate id: ${entry.id}`);
    seen.add(entry.id);
    if (!declared.has(entry.id)) problems.push(`not a declared capability: ${entry.id}`);
    // Both roles are required, so an empty array is a malformed row rather than a partial one.
    if (entry.fires.length === 0) problems.push(`no firing proof: ${entry.id}`);
    if (entry.staysSilent.length === 0) problems.push(`no silence proof: ${entry.id}`);
    for (const role of [entry.fires, entry.staysSilent]) {
      for (const proof of role) if (!tests.has(proof)) problems.push(`proof names no test: ${entry.id} — ${proof}`);
      const sorted = [...role].sort();
      if (role.some((proof, index) => proof !== sorted[index])) problems.push(`proofs unsorted: ${entry.id}`);
      if (new Set(role).size !== role.length) problems.push(`duplicate proof: ${entry.id}`);
    }
  }
  const ids = INSTRUMENTATION.map((entry) => entry.id);
  const sortedIds = [...ids].sort();
  if (ids.some((id, index) => id !== sortedIds[index])) problems.push('capability rows unsorted');
  return problems;
}

export function formatSwfInstrumentationJson(): string {
  return `${JSON.stringify({ capabilities: INSTRUMENTATION, count: INSTRUMENTATION.length }, null, 2)}\n`;
}

function main(): void {
  const problems = verifySwfInstrumentation();
  if (problems.length > 0) {
    console.error(`✗ instrumentation mapping is malformed:\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
    return;
  }

  const json = formatSwfInstrumentationJson();
  if (process.argv.includes('--check')) {
    let current: string | null = null;
    try {
      current = readFileSync(ARTIFACT_PATH, 'utf8');
    } catch {
      current = null;
    }
    if (current !== json) {
      console.error('✗ stale, run `npm run instrumentation`: agents/packages/swf/instrumentation.json');
      process.exitCode = 1;
      return;
    }
    console.log(`OK ${INSTRUMENTATION.length} SWF capabilities carry both a firing and a silence proof`);
    return;
  }

  writeFileSync(ARTIFACT_PATH, json);
  console.log(`✓ wrote ${INSTRUMENTATION.length} fully-proven SWF capabilities`);
}

main();
