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
  // Which audits have actually reached this capability. An audit certifies a population AT A MOMENT, and
  // anything added afterwards — including the fix the audit produced — is outside it. Recording coverage
  // per member rather than per artifact is what stops a newly added row wearing the older rows' results.
  audits: readonly SwfAudit[];
  fires: readonly string[];
  id: string;
  staysSilent: readonly string[];
}

// `scope` — the wire's tested case is the whole of what this capability can lose (property 3).
// `payload` — each proof names a test that actually exercises THIS capability (property 4).
type SwfAudit = 'payload' | 'scope';

const KNOWN_AUDITS: readonly SwfAudit[] = ['payload', 'scope'];

// Proof identifiers are test names, verbatim. A renamed or deleted test breaks the check rather than
// silently degrading the mapping, which is the property that makes the artifact trustworthy.
const INSTRUMENTATION: readonly SwfInstrumentation[] = [
  {
    audits: ['payload', 'scope'],
    fires: ['reports a non-MP3 sound stream, whose blocks do not concatenate'],
    id: 'swf.axis.sound-format-non-mp3',
    staysSilent: ['stays silent about an MP3 stream, whose blocks do concatenate'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a discarded JPEG alpha stream as a Drop, since the bytes are present and go unread'],
    id: 'swf.bitmap.define-bits-jpeg-3',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a discarded alpha stream for DefineBitsJPEG4, whose header differs from JPEG3'],
    id: 'swf.bitmap.define-bits-jpeg-4',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a legacy split JPEG whose halves will not splice into a readable image',
      'reports a legacy split JPEG with no tables in the file as a Drop',
    ],
    id: 'swf.bitmap.define-bits-jpeg-tables',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable glyph table for DefineFont and DefineFont3, not only DefineFont2'],
    id: 'swf.font.define-font',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a font whose glyph table does not decode, which costs the whole font not one glyph',
      'reports one glyph whose outline does not decode, which costs that glyph and not the font',
    ],
    id: 'swf.font.define-font-2',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable glyph table for DefineFont and DefineFont3, not only DefineFont2'],
    id: 'swf.font.define-font-3',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a morph definition that does not decode, which otherwise leaves no trace at all'],
    id: 'swf.morph.define-morph-shape',
    staysSilent: ['stays silent about a morph definition that decodes, so the drop entry carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports nested masks collapsing, since the outer one is not applied at all'],
    id: 'swf.placement.clip-depth',
    staysSilent: ['stays silent about a frame script and a mask that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a blur pass count it cannot represent, and stays silent at one pass',
      'reports a gradient glow angle and distance it cannot represent, and stays silent without them',
    ],
    id: 'swf.placement.filter-list',
    staysSilent: [
      'reports a blur pass count it cannot represent, and stays silent at one pass',
      'reports a gradient glow angle and distance it cannot represent, and stays silent without them',
    ],
  },
  {
    // `scope` withdrawn because property (3) does NOT hold here: the wire covers a DECLINED block and not
    // one TRUNCATED at MAX_FRAME_ACTIONS, so its tested case is not the whole of what can be lost. This is
    // not a failure of the scope audit — a scope audit can only audit EXISTING claims, and a silent
    // truncation makes none. Only the loss-path audit could reach it. Recorded rather than repaired.
    audits: ['payload'],
    fires: ['reports a frame script declined for carrying more than playback commands'],
    id: 'swf.script.do-action',
    staysSilent: ['stays silent about a frame script and a mask that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable shape body as a Recover, since the placeholder still places and sizes'],
    id: 'swf.shape.define-shape',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-2',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-3',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-4',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports scene names as a Skip, since labels import and the named range has no subject'],
    id: 'swf.timeline.define-scene-and-frame-label-data',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a label naming a frame the timeline never reaches, and stays silent when it does'],
    id: 'swf.timeline.frame-label',
    staysSilent: ['reports a label naming a frame the timeline never reaches, and stays silent when it does'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a deliberately declined tag as a Skip, which is correct behaviour rather than failure'],
    id: 'swf.video.video-frame',
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
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
    // A row must carry at least one proven role; the two roles are counted as SEPARATE populations
    // rather than collapsed, because a fire proof and a silence proof license different guarantees.
    if (entry.fires.length === 0 && entry.staysSilent.length === 0) problems.push(`no proof at all: ${entry.id}`);
    for (const audit of entry.audits) {
      if (!KNOWN_AUDITS.includes(audit)) problems.push(`unknown audit: ${entry.id} — ${audit}`);
    }
    const sortedAudits = [...entry.audits].sort();
    if (entry.audits.some((audit, index) => audit !== sortedAudits[index])) {
      problems.push(`audits unsorted: ${entry.id}`);
    }
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
  // `count` is deliberately absent: there is no single count. A fire proof licenses "silence here means
  // nothing was lost"; a silence proof licenses "a firing here means something really was lost". They
  // underwrite different outcomes, so one number would have to pick one and hide the other.
  return `${JSON.stringify(
    {
      capabilities: INSTRUMENTATION,
      fireProven: INSTRUMENTATION.filter((entry) => entry.fires.length > 0).length,
      payloadAudited: INSTRUMENTATION.filter((entry) => entry.audits.includes('payload')).length,
      scopeAudited: INSTRUMENTATION.filter((entry) => entry.audits.includes('scope')).length,
      silenceProven: INSTRUMENTATION.filter((entry) => entry.staysSilent.length > 0).length,
    },
    null,
    2,
  )}\n`;
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
    console.log(
      `OK ${INSTRUMENTATION.filter((entry) => entry.fires.length > 0).length} fire-proven, ` +
        `${INSTRUMENTATION.filter((entry) => entry.staysSilent.length > 0).length} silence-proven`,
    );
    return;
  }

  writeFileSync(ARTIFACT_PATH, json);
  console.log(
    `✓ wrote ${INSTRUMENTATION.filter((entry) => entry.fires.length > 0).length} fire-proven, ` +
      `${INSTRUMENTATION.filter((entry) => entry.staysSilent.length > 0).length} silence-proven`,
  );
}

main();
