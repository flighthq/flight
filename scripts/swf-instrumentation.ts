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
// WHAT THESE COUNTS DO NOT MEAN. `fireProven` and `silenceProven` count wires that FIRE and STAY SILENT
// at a tested input. Neither counts a wire that says something TRUE. A proof asserts the entry's severity
// and detail at the case it exercises; whether the severity is the right one of four, and whether the
// `capability` attribution names the capability a user would agree lost something, is UNAUDITED. A wrong
// name leaves a consumer confidently wrong and acting, where silence only leaves them uninformed.
//
// Run `npm run instrumentation` to regenerate; `npm run instrumentation:check` (wired into `npm run
// check`) fails if the committed artifact is stale or any named proof has gone missing.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The loss family from `agents/packages/swf/loss-path-audit.md` whose audit covered this capability, or
// `null` where none did. NULL IS A REAL ANSWER AND NOT A HOLE TO FILL: most rows below predate the
// loss-path audit entirely, and inventing a family for them would manufacture exactly the audited-looking
// coverage the audit exists to measure. THIS MAPPING IS HAND-MAINTAINED AND IS THE PART THAT DRIFTS —
// nothing detects a new family failing to be recorded here.
type SwfLossFamily = string | null;

interface SwfInstrumentation {
  // Which audits have actually reached this capability. An audit certifies a population AT A MOMENT, and
  // anything added afterwards — including the fix the audit produced — is outside it. Recording coverage
  // per member rather than per artifact is what stops a newly added row wearing the older rows' results.
  audits: readonly SwfAudit[];
  fires: readonly string[];
  id: string;
  lossFamily: SwfLossFamily;
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
    lossFamily: null,
    staysSilent: ['stays silent about an MP3 stream, whose blocks do concatenate'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a discarded JPEG alpha stream as a Skip, since alpha compositing is not implemented yet'],
    id: 'swf.bitmap.define-bits-jpeg-3',
    lossFamily: null,
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a discarded alpha stream for DefineBitsJPEG4, whose header differs from JPEG3'],
    id: 'swf.bitmap.define-bits-jpeg-4',
    lossFamily: null,
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a legacy split JPEG whose halves will not splice into a readable image',
      'reports a legacy split JPEG with no tables in the file as a Drop',
    ],
    id: 'swf.bitmap.define-bits-jpeg-tables',
    lossFamily: null,
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a reused font character id, the one case where the document imports and is simply wrong',
      'reports an unreadable glyph table for DefineFont and DefineFont3, not only DefineFont2',
    ],
    id: 'swf.font.define-font',
    lossFamily: 'F10 font character id reused',
    staysSilent: [
      'stays silent about a font whose character id is used once, so the entry carries information',
      'stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing',
    ],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a font whose glyph table does not decode, which costs the whole font not one glyph',
      'reports a reused character id for DefineFont2, not only the generation the wire was written on',
      'reports one glyph whose outline does not decode, which costs that glyph and not the font',
    ],
    id: 'swf.font.define-font-2',
    lossFamily: 'F10 font character id reused',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable glyph table for DefineFont and DefineFont3, not only DefineFont2'],
    id: 'swf.font.define-font-3',
    lossFamily: 'F10 font character id reused',
    staysSilent: ['stays silent about a font, a spliced JPEG and a JPEG3 that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a morph definition that does not decode, which otherwise leaves no trace at all'],
    id: 'swf.morph.define-morph-shape',
    lossFamily: 'F1 morph definition undecodable',
    staysSilent: ['stays silent about a morph definition that decodes, so the drop entry carries information'],
  },
  {
    // `scope` is WITHDRAWN, and that withdrawal is the only way this hole is visible in the artifact.
    // This capability carries TWO wires. The `fires` entry below proves the undecodable-morph one; the
    // `swf.morph-path-pair-declined` one has no fire proof and structurally cannot get one, because
    // `readSwfMorphShapePaths` builds both halves of a pair in lockstep so the mismatches
    // `createPathMorph` declines on cannot arise from SWF bytes. The schema keys proofs by CAPABILITY, so
    // a non-empty `fires` would otherwise read as "this capability is fire-proven" and hide a wire that
    // is not. A consumer following bytes alone would have been right and still wrong.
    audits: ['payload'],
    fires: ['reports an undecodable morph for DefineMorphShape2, not only the generation the wire was written on'],
    id: 'swf.morph.define-morph-shape-2',
    lossFamily: 'F1 morph definition undecodable',
    staysSilent: ['stays silent when every path pair morphs, so the declined count carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a declared blend mode left unread behind a filter list that did not finish',
      'reports an advanced blend that had no node to carry it, which the appearance report alone holds',
    ],
    id: 'swf.placement.blend-mode',
    lossFamily: 'F4 blend mode behind an unfinished filter list',
    staysSilent: [
      'stays silent when a declared blend mode is reachable, so the drop entry carries information',
      'stays silent when an advanced blend has a node to carry it, so the drop entry carries information',
    ],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports nested masks collapsing, since the outer one is not applied at all'],
    id: 'swf.placement.clip-depth',
    lossFamily: null,
    staysSilent: ['stays silent about a frame script and a mask that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports a blur pass count it cannot represent, and stays silent at one pass',
      'reports a gradient glow angle and distance it cannot represent, and stays silent without them',
    ],
    id: 'swf.placement.filter-list',
    lossFamily: 'F8 appearance channel with no node',
    staysSilent: [
      'reports a blur pass count it cannot represent, and stays silent at one pass',
      'reports a gradient glow angle and distance it cannot represent, and stays silent without them',
    ],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'names the anonymous DoABC form separately, since the two are different capabilities',
      'reports a declined frame script through the full import path, not only the reader in isolation',
      'reports a frame script whose body is not a command this importer obeys',
      'reports an ABC blob that yields no frame scripts, naming which of the two DoABC forms it was',
    ],
    id: 'swf.script.do-abc',
    lossFamily: 'F5 ABC blob yielding no frame scripts',
    staysSilent: ['stays silent about a frame script it does obey, so the drop entry carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['names the anonymous DoABC form separately, since the two are different capabilities'],
    id: 'swf.script.do-abc-anonymous',
    lossFamily: 'F5 ABC blob yielding no frame scripts',
    staysSilent: ['stays silent about an anonymous DoABC it does obey, so the drop entry carries information'],
  },
  {
    // `scope` withdrawn because property (3) does NOT hold here: the wire covers a DECLINED block and not
    // one TRUNCATED at MAX_FRAME_ACTIONS, so its tested case is not the whole of what can be lost. This is
    // not a failure of the scope audit — a scope audit can only audit EXISTING claims, and a silent
    // truncation makes none. Only the loss-path audit could reach it. Recorded rather than repaired.
    audits: ['payload'],
    fires: ['reports a frame script declined for carrying more than playback commands'],
    id: 'swf.script.do-action',
    lossFamily: null,
    staysSilent: ['stays silent about a frame script and a mask that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an init action declined the same way DoAction is, which it silently did not'],
    id: 'swf.script.do-init-action',
    lossFamily: 'F12 init action declined without a crumb',
    staysSilent: ['stays silent about an init action it does obey, so the skip entry carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable shape body as a Recover, since the placeholder still places and sizes'],
    id: 'swf.shape.define-shape',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-2',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-3',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an unreadable body for every shape generation, not just the one the wire was written on'],
    id: 'swf.shape.define-shape-4',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: [
      'reports an edit text body that does not parse, which otherwise loses the field with no signal',
      'reports an edit text whose font id resolves to no name, leaving the field sized but unfamilied',
    ],
    id: 'swf.text.define-edit-text',
    lossFamily: 'F3 edit text unparseable',
    // Both wires on this capability now have their own silence proof. The font-name one was recorded as an
    // absent proof for want of a DefineFont2 that parses; the version-routing work produced one, so the
    // hole closed as a side effect of unrelated work rather than by trying harder at it.
    staysSilent: [
      'stays silent about an edit text body that parses, so the drop entry carries information',
      'stays silent when an edit text font id does resolve, so the unresolved entry carries information',
    ],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a static text body that does not compose, which the deferred pass would otherwise swallow'],
    id: 'swf.text.define-text',
    lossFamily: 'F2 static text uncomposable',
    staysSilent: ['stays silent about a static text body that composes, so the drop entry carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports an uncomposable body for DefineText2, not only the generation the wire was written on'],
    id: 'swf.text.define-text-2',
    lossFamily: 'F2 static text uncomposable',
    staysSilent: ['stays silent about a DefineText2 body that composes, so the drop entry carries information'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports scene names as a Skip, since labels import and the named range has no subject'],
    id: 'swf.timeline.define-scene-and-frame-label-data',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['counts the children a sprite bounds union could not include, since the box survives smaller'],
    id: 'swf.timeline.define-sprite',
    lossFamily: 'F7 sprite bounds union short',
    staysSilent: ['stays silent when every child of a sprite contributes its bounds'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a label naming a frame the timeline never reaches, and stays silent when it does'],
    id: 'swf.timeline.frame-label',
    lossFamily: null,
    staysSilent: ['reports a label naming a frame the timeline never reaches, and stays silent when it does'],
  },
  {
    audits: ['payload', 'scope'],
    fires: ['reports a deliberately declined tag as a Skip, which is correct behaviour rather than failure'],
    id: 'swf.video.video-frame',
    lossFamily: null,
    staysSilent: ['stays silent about a shape, a video stream and a scene table that lose nothing'],
  },
];

const REPO_ROOT = join(import.meta.dirname, '..');
const CELL_DIR = join(REPO_ROOT, 'agents', 'packages', 'swf');
const ARTIFACT_PATH = join(CELL_DIR, 'instrumentation.json');
const CAPABILITIES_PATH = join(CELL_DIR, 'capabilities.json');
const SOURCE_DIR = join(REPO_ROOT, 'packages', 'swf', 'src');

// A capability whose wire emits no `capability` field in its diagnostic detail, so its fire proof has
// nothing to name and the relevance check below cannot apply. EXEMPTIONS ARE LISTED, NOT INFERRED: an
// unlisted miss is a failure, so a wire that stops carrying its capability id breaks the build rather
// than quietly joining this set.
const RELEVANCE_EXEMPT: ReadonlyMap<string, string> = new Map([
  ['swf.script.do-abc', 'the frame-script wire reports { frame, reason } and carries no capability field'],
]);

// Test bodies, keyed by test name. Needed because verifying a proof EXISTS is invariant under swapping
// two proofs between rows — a permutation preserves existence by construction, so no number of extra
// proofs could ever catch it. Verified by experiment: permuting two unrelated rows' fire proofs and
// regenerating left the gate reporting OK. Relevance is the property that distinguishes them.
function readTestBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of readdirSync(SOURCE_DIR)) {
    if (!file.endsWith('.test.ts')) continue;
    const source = readFileSync(join(SOURCE_DIR, file), 'utf8');
    for (const match of source.matchAll(/\bit\('((?:[^'\\]|\\.)*)',[\s\S]*?\n  \}\);/g)) {
      bodies.set(match[1].replace(/\\'/g, "'"), match[0]);
    }
  }
  return bodies;
}

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
  const bodies = readTestBodies();
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

    // A FIRE proof must name a test that actually mentions this capability id, not merely a test that
    // exists. Existence is invariant under swapping two rows' proofs; relevance is not.
    //
    // A SILENCE proof is NOT exempted by oversight and cannot be checked this way at all: it asserts that
    // NO diagnostic fired, so it has no detail object and no capability id to name. That half of the
    // mapping stays permutable, and saying so is the only honest option available.
    if (!RELEVANCE_EXEMPT.has(entry.id)) {
      for (const proof of entry.fires) {
        const body = bodies.get(proof);
        if (body !== undefined && !body.includes(`'${entry.id}'`)) {
          problems.push(`fire proof does not exercise this capability: ${entry.id} — ${proof}`);
        }
      }
    }
  }
  const ids = INSTRUMENTATION.map((entry) => entry.id);
  const sortedIds = [...ids].sort();
  if (ids.some((id, index) => id !== sortedIds[index])) problems.push('capability rows unsorted');
  return problems;
}

// The audited subject, AS IT WAS WHEN THE AUDIT HAPPENED — the git tree object of `packages/swf/src` at
// the commit that landed this row's proof. A tree oid is already a content hash of the whole directory,
// so this is git's own value rather than one invented here.
//
// THIS IS A HISTORICAL CHECK, AND A HISTORICAL CHECK HAS A BASELINE THAT LANDING CAN MOVE. The test for
// any gate is whether landing the change alters what it should say: a property check is idempotent under
// landing, a historical one is not. This one asks *when was this audited*, which is historical.
//
// VERIFIED IDEMPOTENT UNDER REBASE, and for a reason worth keeping: `subjectHash` is a git TREE OID, which
// is content-addressed, so rewriting commits does not move it. Two rebases across 161 peer commits left
// all 14 identities byte-identical. Had this pinned a commit SHA instead, every rebase would have
// restamped every audit.
//
// NOT VERIFIED, AND PREDICTED TO MOVE: a SQUASH merge. `git log -S` would then resolve to the squashed
// commit, whose `packages/swf/src` tree is the FINAL state rather than the state at the audit, so both
// `auditedAt` and `subjectHash` would silently take post-merge values. That cannot be tested from inside
// this clone. **A reader who finds every identity sharing one timestamp and one tree oid is looking at
// that failure, not at fourteen audits that happened at once.**
//
// WHY NOT HASH THE CURRENT SOURCE. A hash recomputed at generation time changes whenever ANY file in the
// package changes, and the artifact regenerates automatically — so an unrelated edit would silently
// restamp every audit as covering a subject nobody re-audited. That is the audit-drift shape with a
// machine doing the drifting. Pinning to the audit's own commit makes the value stable and true: it
// stops moving precisely because the audit stopped happening.
function resolveSwfAuditSubject(commit: string): string | null {
  try {
    const tree = execFileSync('git', ['rev-parse', `${commit}:packages/swf/src`], { encoding: 'utf8' }).trim();
    return tree === '' ? null : `git-tree:${tree}`;
  } catch {
    return null;
  }
}

// The commit that introduced this row's first proof IS the moment the audit reached this capability.
// Recovered from history rather than stamped at generation time: the generator's clock would claim every
// audit happened at once, which is false.
function resolveSwfAuditCommit(entry: Readonly<SwfInstrumentation>): { commit: string; date: string } | null {
  const probe = entry.fires[0] ?? entry.staysSilent[0];
  if (probe === undefined) return null;
  try {
    const line = execFileSync(
      'git',
      ['log', '-1', '--format=%H %aI', `-S${probe}`, '--', 'scripts/swf-instrumentation.ts'],
      { encoding: 'utf8' },
    ).trim();
    if (line === '') return null;
    const [commit, date] = line.split(' ');
    return { commit, date };
  } catch {
    return null;
  }
}

// `lossPath` ALWAYS carries an explicit `state`, and never `null`.
//
// WHY NOT NULL. Three different writer situations can reach this function: no loss-family audit covered
// the capability, an audit covered it and its identity was recovered, and an audit covered it but the
// identity could NOT be recovered (a shallow clone, a renamed generator, a squashed history). The first
// and third are opposite meanings — *nobody audited this* versus *someone did and we cannot say who or
// when* — and returning `null` for both stores them as the same bytes AT WRITE TIME. No amount of care
// at read time can recover a distinction the representation already discarded, and the safe default is
// the one a reader assumes.
//
// Today no row is in the third state, which is exactly why it is worth encoding now: the value is
// currently correct BY LUCK rather than by construction, and the first shallow clone would silently
// convert an identified audit into an unaudited one.
function buildSwfLossPath(entry: Readonly<SwfInstrumentation>): Record<string, unknown> {
  if (entry.lossFamily === null) return { state: 'unaudited' };
  const audit = resolveSwfAuditCommit(entry);
  if (audit === null) {
    return { family: entry.lossFamily, reason: 'audit commit not recoverable from history', state: 'unidentified' };
  }
  const subjectHash = resolveSwfAuditSubject(audit.commit);
  if (subjectHash === null) {
    return { family: entry.lossFamily, reason: 'audited subject tree not recoverable', state: 'unidentified' };
  }
  return {
    auditId: `swf-loss-${createHash('sha256').update(`builder2|${entry.id}|${subjectHash}`).digest('hex').slice(0, 16)}`,
    auditedAt: audit.date,
    auditor: 'builder2',
    family: entry.lossFamily,
    state: 'identified',
    subjectHash,
  };
}

export function formatSwfInstrumentationJson(): string {
  // `count` is deliberately absent: there is no single count. A fire proof licenses "silence here means
  // nothing was lost"; a silence proof licenses "a firing here means something really was lost". They
  // underwrite different outcomes, so one number would have to pick one and hide the other.
  return `${JSON.stringify(
    {
      capabilities: INSTRUMENTATION.map((entry) => ({ ...entry, lossPath: buildSwfLossPath(entry) })),
      fireProven: INSTRUMENTATION.filter((entry) => entry.fires.length > 0).length,
      payloadAudited: INSTRUMENTATION.filter((entry) => entry.audits.includes('payload')).length,
      scopeAudited: INSTRUMENTATION.filter((entry) => entry.audits.includes('scope')).length,
      lossPathIdentified: INSTRUMENTATION.filter((entry) => entry.lossFamily !== null).length,
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
