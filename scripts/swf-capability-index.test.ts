import { deriveImportConformanceCapabilityScopedUnknownEvidence } from './import-conformance-score';
import {
  SWF_CAPABILITY_SCOPED_UNKNOWN_MAPPINGS,
  SWF_IMPORTER_DECLARED_INDIVIDUATION_MARGIN,
} from './swf-capability-index';

describe('SWF scoreboard declarations', () => {
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
