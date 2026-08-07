import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { retainImportConformanceDiagnostic } from './import-conformance-diagnostic-evidence';

const CAPABILITIES = new Set(['swf.script.do-action']);

describe('retainImportConformanceDiagnostic', () => {
  it('retains the six audited detail fields with code-owned diagnostic identity', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({
          capability: 'swf.script.do-action',
          characterId: 1,
          compression: 'lzma',
          frame: 2,
          length: 30,
          sceneCount: 4_294_967_280,
        }),
        CAPABILITIES,
      ),
    ).toEqual({
      detail: {
        capability: 'swf.script.do-action',
        characterId: 1,
        compression: 'lzma',
        frame: 2,
        length: 30,
        sceneCount: 4_294_967_280,
      },
      kind: 'swf.frame-script-declined',
      origin: 'readSwfTimeline',
      severity: ImportDiagnosticSeverity.Skip,
    });
  });

  it('drops fixture-derived names and undecided future fields regardless of their value type', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({
          blockName: 'fixture-owned',
          futureBoolean: true,
          futureCount: 7,
          name: 'fixture-owned',
        }),
        CAPABILITIES,
      ),
    ).toEqual({
      kind: 'swf.frame-script-declined',
      origin: 'readSwfTimeline',
      severity: ImportDiagnosticSeverity.Skip,
    });
  });

  it('does not retain unrecognised values under the two code-owned tag keys', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({ capability: 'swf.fixture.supplied', compression: 'fixture-supplied' }),
        CAPABILITIES,
      ),
    ).not.toHaveProperty('detail');
  });

  it('retains every code-owned compression tag', () => {
    expect(retainImportConformanceDiagnostic(diagnostic({ compression: 'deflate' }), CAPABILITIES)).toHaveProperty(
      'detail.compression',
      'deflate',
    );
    expect(retainImportConformanceDiagnostic(diagnostic({ compression: 'lzma' }), CAPABILITIES)).toHaveProperty(
      'detail.compression',
      'lzma',
    );
  });

  it('does not retain invalid numeric values under permitted count and index keys', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({ characterId: -1, frame: 1.5, length: Number.POSITIVE_INFINITY, sceneCount: '4' }),
        CAPABILITIES,
      ),
    ).not.toHaveProperty('detail');
  });
});

function diagnostic(detail: ImportDiagnostic['detail']): ImportDiagnostic {
  return {
    detail,
    kind: 'swf.frame-script-declined',
    origin: 'readSwfTimeline',
    severity: ImportDiagnosticSeverity.Skip,
  };
}
