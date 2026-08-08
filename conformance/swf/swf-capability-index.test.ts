import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FIXTURE_RELEASE_TAG, writeFixtureTreeStamp } from '../../scripts/fixtures';
import { deriveImportConformanceCapabilityScopedUnknownEvidence } from '../core/import-conformance-score';
import {
  createSwfImportConformanceDenominators,
  SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
  SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
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

describe('swf-capability-index CLI', () => {
  it('accepts the pinned fixture stamp and rejects a stale release stamp', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-swf-capability-index-'));
    const tree = join(root, 'extracted', 'full', 'swf-ruffle-fixtures');
    mkdirSync(tree, { recursive: true });
    writeFileSync(join(tree, 'unreadable.swf'), Uint8Array.of(0));
    const stamp = {
      packs: [
        {
          file: 'unused.tar.gz',
          metadataFiles: 0,
          pack: 'swf-ruffle-fixtures',
          sha256: 'a'.repeat(64),
          verifiedFixtureFiles: 1,
        },
      ],
      tag: FIXTURE_RELEASE_TAG,
      variant: 'full',
    } as const;

    writeFixtureTreeStamp(tree, stamp);
    const accepted = runCli(root);
    expect(accepted.status).toBe(0);
    expect(accepted.stdout).toContain('Indexed 1 SWFs from 1 corpus files; 1 unreadable.');

    writeFixtureTreeStamp(tree, { ...stamp, tag: `${FIXTURE_RELEASE_TAG}-stale` });
    const rejected = runCli(root);
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('Verified swf-ruffle-fixtures full tree is unavailable');
  }, 15_000);

  it('rejects an unstamped fixture tree instead of producing measured evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'flight-swf-capability-index-'));
    mkdirSync(join(root, 'extracted', 'full', 'swf-ruffle-fixtures'), { recursive: true });

    const result = runCli(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Verified swf-ruffle-fixtures full tree is unavailable');
  }, 15_000);
});

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
