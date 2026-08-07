import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import type { ImportConformanceIndexedFixture, ImportConformanceResult } from './import-conformance-core';
import type { SwfImportConformanceObservation } from './swf-import-conformance-worker-protocol';

export function classifyImportConformanceObservation(
  fixture: Readonly<ImportConformanceIndexedFixture>,
  observation: Readonly<SwfImportConformanceObservation>,
): ImportConformanceResult {
  if (fixture.reference !== observation.reference || fixture.sourceHash !== observation.sourceHash) {
    throw new Error(`Worker observation does not match indexed fixture ${fixture.reference}`);
  }
  const known = new Set(fixture.capabilities);
  const keyed = new Map<string, ImportDiagnostic[]>();
  for (const diagnostic of observation.diagnostics) {
    const capability = diagnostic.detail?.capability;
    if (typeof capability !== 'string') continue;
    if (!known.has(capability)) {
      throw new Error(`Diagnostic for ${fixture.reference} names capability absent from its index: ${capability}`);
    }
    const existing = keyed.get(capability);
    if (existing === undefined) keyed.set(capability, [diagnostic]);
    else existing.push(diagnostic);
  }

  return {
    capabilityOutcomes: fixture.capabilities.map((id) => ({
      diagnosticReported: keyed.has(id),
      id,
      outcome: classifyCapabilityOutcome(observation, keyed.get(id) ?? []),
    })),
    outcome: classifyFixtureOutcome(observation),
    reference: fixture.reference,
    sourceHash: fixture.sourceHash,
  };
}

function classifyCapabilityOutcome(
  observation: Readonly<SwfImportConformanceObservation>,
  diagnostics: readonly Readonly<ImportDiagnostic>[],
): ImportConformanceResult['outcome'] {
  if (observation.threw) return 'threw';
  if (diagnostics.some(isDefectDiagnostic)) return 'importedWrong';
  if (diagnostics.some(isUnsupportedDiagnostic)) return 'unsupportedClean';
  if (!observation.imported) {
    if (observation.diagnostics.some(isNoDecompressorDiagnostic)) return 'unsupportedClean';
    if (observation.diagnostics.some(isDefectDiagnostic)) return 'importedWrong';
    return 'silentlyWrong';
  }
  return 'passed';
}

function classifyFixtureOutcome(
  observation: Readonly<SwfImportConformanceObservation>,
): ImportConformanceResult['outcome'] {
  if (observation.threw) return 'threw';
  if (observation.diagnostics.some(isNoDecompressorDiagnostic)) return 'unsupportedClean';
  if (observation.diagnostics.some(isDefectDiagnostic)) return 'importedWrong';
  if (observation.diagnostics.some(isUnsupportedDiagnostic)) return 'unsupportedClean';
  return observation.imported ? 'passed' : 'silentlyWrong';
}

function isDefectDiagnostic(diagnostic: Readonly<ImportDiagnostic>): boolean {
  return (
    diagnostic.severity === ImportDiagnosticSeverity.Drop ||
    diagnostic.severity === ImportDiagnosticSeverity.Recover ||
    (diagnostic.severity === ImportDiagnosticSeverity.Reject && !isNoDecompressorDiagnostic(diagnostic))
  );
}

function isNoDecompressorDiagnostic(diagnostic: Readonly<ImportDiagnostic>): boolean {
  return diagnostic.kind === 'swf.no-decompressor-registered';
}

function isUnsupportedDiagnostic(diagnostic: Readonly<ImportDiagnostic>): boolean {
  return diagnostic.severity === ImportDiagnosticSeverity.Skip || isNoDecompressorDiagnostic(diagnostic);
}
