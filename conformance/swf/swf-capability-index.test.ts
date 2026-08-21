import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_RELEASE_TAG, writeFixtureTreeStamp } from '../../scripts/fixtures';
import { deriveImportConformanceCapabilityScopedUnknownEvidence } from '../core/import-conformance-score';
import {
  SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
  SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
  UNVERIFIED_SWF_FIXTURE_TREE_MESSAGE,
  createSwfImportConformanceDenominators,
  resolveVerifiedSwfFixturePack,
} from './swf-capability-index';

describe('SWF scoreboard declarations', () => {
  it('adapts the frozen SWF measurement method into generic denominator readings', () => {
    expect(createSwfImportConformanceDenominators(82)).toMatchObject({
      format: { format: 'swf', state: 'unmeasured' },
      producerDeclared: {
        declaredRows: 82,
        methodology: 'unresolved-individuation-v1',
        readings: expect.arrayContaining([
          { id: 'frozen-declared-rows', value: 82 },
          { id: 'rejected-circular-candidate', value: 'corpus-differential-behavior' },
        ]),
        state: 'unresolved',
      },
    });
  });

  it('keeps the four frozen individuation readings as separately named counts', () => {
    expect(SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN).toEqual({
      behaviorPreservingRefactorRows: 77,
      discriminatedSourceRows: 80,
      frozenDeclaredRows: 82,
      rejectedCircularCandidate: 'corpus-differential-behavior',
      sameDispatchArmRows: 66,
      state: 'frozen-no-election',
    });
  });

  it('derives each provisional loop-bound membership from one producer-owned mapping', () => {
    const evidence = deriveImportConformanceCapabilityScopedUnknownEvidence(
      [
        'swf.button.define-button',
        'swf.button.define-button-2',
        'swf.script.do-action',
        'swf.script.do-init-action',
        'swf.text.define-text',
        'swf.text.define-text-2',
      ],
      SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
    );

    expect(
      evidence.map(({ capabilityId, configurationLimits, forcedResults, unknownObservations }) => ({
        capabilityId,
        configurationLimits,
        forcedResults,
        unknownObservations,
      })),
    ).toEqual([
      limited('swf.button.define-button', 'MAX_BUTTON_RECORDS'),
      limited('swf.button.define-button-2', 'MAX_BUTTON_RECORDS'),
      limited('swf.script.do-action', 'MAX_FRAME_ACTIONS'),
      limited('swf.script.do-init-action', 'MAX_FRAME_ACTIONS'),
      limited('swf.text.define-text', 'MAX_TEXT_RECORDS'),
      limited('swf.text.define-text-2', 'MAX_TEXT_RECORDS'),
    ]);
  });
});

describe('resolveVerifiedSwfFixturePack', () => {
  // The accept and reject conditions the CLI turns on, asserted where they are decided. A pure function
  // of the stamp on disk: no argv, no exit code, no stdout, and nothing about the corpus.
  it('returns the pack entry for a tree stamped with the pinned release', () => {
    const tree = stampedTree({ tag: FIXTURE_RELEASE_TAG, variant: 'full' });

    expect(resolveVerifiedSwfFixturePack(tree)).toMatchObject({
      pack: 'swf-ruffle-fixtures',
      verifiedFixtureFiles: 1,
    });
  });

  it('returns null for a stale release tag, an unstamped tree, and a mismatched variant alike', () => {
    // One sentinel for all of them on purpose: the caller's remedy is the same in every case, which is
    // why the CLI carries one message rather than four.
    expect(
      resolveVerifiedSwfFixturePack(stampedTree({ tag: `${FIXTURE_RELEASE_TAG}-stale`, variant: 'full' })),
    ).toBeNull();
    expect(resolveVerifiedSwfFixturePack(stampedTree({ tag: FIXTURE_RELEASE_TAG, variant: 'demo' }))).toBeNull();
    expect(resolveVerifiedSwfFixturePack(unstampedTree())).toBeNull();
    expect(resolveVerifiedSwfFixturePack(join(unstampedTree(), 'absent'))).toBeNull();
  });

  it('returns null when the stamp names other packs but not this one', () => {
    const tree = stampedTree({ pack: 'some-other-pack', tag: FIXTURE_RELEASE_TAG, variant: 'full' });

    expect(resolveVerifiedSwfFixturePack(tree)).toBeNull();
  });
});

describe('swf-capability-index CLI', () => {
  // ONE spawn, for the one property that only exists in a process: a thrown main surfaces as exit code 1
  // with the message on stderr. The conditions that decide whether main throws are asserted above, so
  // this does not re-pay a process per condition to observe a mapping that does not vary with them.
  it('surfaces an unusable fixture tree as a failing exit code and a message on stderr', () => {
    const result = runCli(unstampedTree(true));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(UNVERIFIED_SWF_FIXTURE_TREE_MESSAGE);
  }, 15_000);
});

function stampedTree(options: { pack?: string; tag: string; variant: string }): string {
  const root = mkdtempSync(join(tmpdir(), 'flight-swf-capability-index-'));
  const tree = join(root, 'extracted', 'full', 'swf-ruffle-fixtures');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'unreadable.swf'), Uint8Array.of(0));
  writeFixtureTreeStamp(tree, {
    packs: [
      {
        file: 'unused.tar.gz',
        metadataFiles: 0,
        pack: options.pack ?? 'swf-ruffle-fixtures',
        sha256: 'a'.repeat(64),
        verifiedFixtureFiles: 1,
        verifiedFixturePaths: ['unreadable.swf'],
      },
    ],
    tag: options.tag,
    variant: options.variant,
  });
  return tree;
}

// Returns the tree by default, or the ROOT when the CLI is the caller — it resolves the tree itself from
// FLIGHT_FIXTURES_DIR and would otherwise be handed a path one level too deep.
function unstampedTree(asRoot = false): string {
  const root = mkdtempSync(join(tmpdir(), 'flight-swf-capability-index-'));
  const tree = join(root, 'extracted', 'full', 'swf-ruffle-fixtures');
  mkdirSync(tree, { recursive: true });
  return asRoot ? root : tree;
}

function runCli(root: string) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(import.meta.dirname, 'swf-capability-index.ts')], {
    cwd: join(import.meta.dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, FLIGHT_FIXTURES_DIR: root },
  });
}

function limited(capabilityId: string, limitId: string) {
  return {
    capabilityId,
    configurationLimits: {
      limits: [{ id: limitId, reporting: 'unobservable' }],
      state: 'declared',
    },
    forcedResults: { fire: { state: 'unknown' }, silence: { state: 'unknown' } },
    unknownObservations: [{ reason: 'loop-bounded-configuration-limit', reference: limitId }],
  };
}
