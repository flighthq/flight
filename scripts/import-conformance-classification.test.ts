import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { classifyImportConformanceDiagnosticObservation } from './import-conformance-classification';
import type { ImportConformanceDiagnosticEvidencePolicy } from './import-conformance-diagnostic-evidence';

const MD5_POLICY = {
  detail: [],
  id: 'md5-diagnostic-evidence-v1',
  unsupportedDiagnosticKinds: ['md5.decoder-missing'],
} as const satisfies ImportConformanceDiagnosticEvidencePolicy;

describe('classifyImportConformanceDiagnosticObservation', () => {
  it('applies an adapter-owned unsupported kind before the shared defect severity order', () => {
    expect(
      classifyImportConformanceDiagnosticObservation(
        {
          diagnostics: [
            {
              kind: 'md5.decoder-missing',
              origin: 'importMd5',
              severity: ImportDiagnosticSeverity.Reject,
            },
            diagnostic(ImportDiagnosticSeverity.Drop, 'md5.section-dropped'),
          ],
          imported: false,
          threw: false,
        },
        MD5_POLICY,
      ),
    ).toBe('unsupportedClean');
  });

  it.each([
    [true, false, [], 'passed'],
    [false, false, [], 'silentlyWrong'],
    [true, true, [], 'threw'],
    [true, false, [diagnostic(ImportDiagnosticSeverity.Skip, 'md5.section-skipped')], 'unsupportedClean'],
    [true, false, [diagnostic(ImportDiagnosticSeverity.Drop, 'md5.section-dropped')], 'importedWrong'],
  ] as const)('classifies imported=%s threw=%s diagnostics=%j as %s', (imported, threw, diagnostics, outcome) => {
    expect(classifyImportConformanceDiagnosticObservation({ diagnostics, imported, threw }, MD5_POLICY)).toBe(outcome);
  });
});

function diagnostic(severity: ImportDiagnostic['severity'], kind: string): ImportDiagnostic {
  return { kind, origin: 'importMd5', severity };
}
