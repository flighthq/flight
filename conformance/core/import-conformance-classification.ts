import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import type { ImportConformanceResult } from './import-conformance-core';
import type { ImportConformanceDiagnosticEvidencePolicy } from './import-conformance-diagnostic-evidence';

export interface ImportConformanceDiagnosticObservation {
  diagnostics: readonly Readonly<ImportDiagnostic>[];
  imported: boolean;
  threw: boolean;
}

export function classifyImportConformanceDiagnosticObservation(
  observation: Readonly<ImportConformanceDiagnosticObservation>,
  policy: Readonly<ImportConformanceDiagnosticEvidencePolicy>,
): ImportConformanceResult['importOutcome'] {
  if (observation.threw) return 'threw';
  if (observation.diagnostics.some((diagnostic) => policy.unsupportedDiagnosticKinds.includes(diagnostic.kind))) {
    return 'unsupportedClean';
  }
  if (observation.diagnostics.some(isDefectSeverity)) return 'importedWrong';
  if (observation.diagnostics.some((diagnostic) => diagnostic.severity === ImportDiagnosticSeverity.Skip)) {
    return 'unsupportedClean';
  }
  return observation.imported ? 'passed' : 'silentlyWrong';
}

function isDefectSeverity(diagnostic: Readonly<ImportDiagnostic>): boolean {
  return (
    diagnostic.severity === ImportDiagnosticSeverity.Drop ||
    diagnostic.severity === ImportDiagnosticSeverity.Recover ||
    diagnostic.severity === ImportDiagnosticSeverity.Reject
  );
}
