import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { classifyImportConformanceObservation } from './import-conformance-classifier';

const FIXTURE = {
  capabilities: ['swf.video.video-frame'],
  probeState: 'readable',
  reference: 'video.swf',
  sourceHash: 'a'.repeat(64),
} as const;

describe('classifyImportConformanceObservation', () => {
  it('classifies a keyed Skip as unsupportedClean', () => {
    expect(classify([diagnostic(ImportDiagnosticSeverity.Skip, 'swf.video-frame-payload')])).toMatchObject({
      capabilityOutcomes: [{ diagnosticReported: true, id: 'swf.video.video-frame', outcome: 'unsupportedClean' }],
      outcome: 'unsupportedClean',
    });
  });

  it.each([ImportDiagnosticSeverity.Drop, ImportDiagnosticSeverity.Recover, ImportDiagnosticSeverity.Reject])(
    'classifies a keyed %s as importedWrong',
    (severity) => {
      expect(classify([diagnostic(severity, 'swf.video-frame-payload')])).toMatchObject({
        capabilityOutcomes: [{ diagnosticReported: true, id: 'swf.video.video-frame', outcome: 'importedWrong' }],
        outcome: 'importedWrong',
      });
    },
  );

  it('keeps no-decompressor Reject in unsupportedClean', () => {
    expect(
      classify(
        [
          {
            kind: 'swf.no-decompressor-registered',
            origin: 'uncompressSwfSource',
            severity: ImportDiagnosticSeverity.Reject,
          },
        ],
        false,
      ),
    ).toMatchObject({ outcome: 'unsupportedClean' });
  });

  it('distinguishes a silent refusal from successful diagnostic silence', () => {
    expect(classify([], false)).toMatchObject({
      capabilityOutcomes: [{ diagnosticReported: false, outcome: 'silentlyWrong' }],
      outcome: 'silentlyWrong',
    });
    expect(classify([], true)).toMatchObject({
      capabilityOutcomes: [{ diagnosticReported: false, outcome: 'passed' }],
      outcome: 'passed',
    });
  });

  it('rejects a capability diagnostic that the exhaustive index did not find', () => {
    expect(() =>
      classify([
        {
          detail: { capability: 'swf.shape.define-shape' },
          kind: 'swf.shape-body-unreadable',
          origin: 'readSwfBoundedDefinition',
          severity: ImportDiagnosticSeverity.Drop,
        },
      ]),
    ).toThrow(/capability absent from its index/);
  });
});

function classify(diagnostics: ImportDiagnostic[], imported = true) {
  return classifyImportConformanceObservation(FIXTURE, {
    diagnostics,
    imported,
    reference: FIXTURE.reference,
    sourceHash: FIXTURE.sourceHash,
    threw: false,
  });
}

function diagnostic(severity: ImportDiagnostic['severity'], kind: string): ImportDiagnostic {
  return {
    detail: { capability: 'swf.video.video-frame' },
    kind,
    origin: 'readSwfTimeline',
    severity,
  };
}
