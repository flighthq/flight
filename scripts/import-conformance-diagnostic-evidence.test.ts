import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  assertImportConformanceDiagnosticEvidencePolicy,
  cloneImportConformanceDiagnosticEvidencePolicy,
  parseImportConformanceDiagnosticEvidencePolicy,
  parseImportConformanceRetainedDiagnostic,
  retainImportConformanceDiagnostic,
} from './import-conformance-diagnostic-evidence';
import type { ImportConformanceDiagnosticEvidencePolicy } from './import-conformance-diagnostic-evidence';
import { SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY } from './swf-import-conformance-policy';

const CAPABILITIES = new Set(['swf.script.do-action']);
const MD5_POLICY = {
  detail: [
    { field: 'section', rule: { kind: 'string-enum', values: ['animation', 'mesh'] } },
    { field: 'tokenIndex', rule: { kind: 'nonnegative-integer' } },
  ],
  id: 'md5-diagnostic-evidence-v1',
  unsupportedDiagnosticKinds: [],
} as const satisfies ImportConformanceDiagnosticEvidencePolicy;

describe('import conformance diagnostic evidence policy', () => {
  it('round-trips a format-owned policy and keeps its clone independent', () => {
    expect(() => assertImportConformanceDiagnosticEvidencePolicy(MD5_POLICY)).not.toThrow();
    const clone = cloneImportConformanceDiagnosticEvidencePolicy(MD5_POLICY);
    expect(clone).toEqual(MD5_POLICY);
    expect(clone).not.toBe(MD5_POLICY);
    expect(parseImportConformanceDiagnosticEvidencePolicy(JSON.parse(JSON.stringify(MD5_POLICY)))).toEqual(MD5_POLICY);
  });

  it('uses the selected adapter policy to retain and validate non-SWF detail', () => {
    const retained = retainImportConformanceDiagnostic(
      diagnostic({ name: 'fixture-owned', section: 'mesh', tokenIndex: 7 }),
      new Set(),
      MD5_POLICY,
    );
    expect(retained).toMatchObject({ detail: { section: 'mesh', tokenIndex: 7 } });
    expect(parseImportConformanceRetainedDiagnostic(retained, new Set(), MD5_POLICY)).toEqual(retained);
    expect(() =>
      parseImportConformanceRetainedDiagnostic(
        { ...retained, detail: { name: 'fixture-owned', section: 'mesh' } },
        new Set(),
        MD5_POLICY,
      ),
    ).toThrow('fields not declared by policy: name');
  });
});

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
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
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
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
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
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
      ),
    ).not.toHaveProperty('detail');
  });

  it('retains every code-owned compression tag', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({ compression: 'deflate' }),
        CAPABILITIES,
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
      ),
    ).toHaveProperty('detail.compression', 'deflate');
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({ compression: 'lzma' }),
        CAPABILITIES,
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
      ),
    ).toHaveProperty('detail.compression', 'lzma');
  });

  it('does not retain invalid numeric values under permitted count and index keys', () => {
    expect(
      retainImportConformanceDiagnostic(
        diagnostic({ characterId: -1, frame: 1.5, length: Number.POSITIVE_INFINITY, sceneCount: '4' }),
        CAPABILITIES,
        SWF_IMPORT_CONFORMANCE_DIAGNOSTIC_EVIDENCE_POLICY,
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
