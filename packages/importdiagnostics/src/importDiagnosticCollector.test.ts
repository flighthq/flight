import type { ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { collectImportDiagnostics, reportImportDiagnostic } from './importDiagnosticCollector';

describe('collectImportDiagnostics', () => {
  it('returns the crumbs the run callback emits into its engaged collector', () => {
    // Stands in for `collectImportDiagnostics((sink) => parseAwd2(bytes, sink))`.
    const diagnostics = collectImportDiagnostics((sink) => {
      reportImportDiagnostic(sink, ImportDiagnosticSeverity.Skip, 'awd2.method-material', 'resolveAwdMaterial', {
        count: 2,
      });
      reportImportDiagnostic(sink, ImportDiagnosticSeverity.Reject, 'awd2.unsupported-version', 'parseAwd2', {
        version: 3,
      });
    });
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.kind)).toEqual(['awd2.method-material', 'awd2.unsupported-version']);
  });

  it('returns an empty array when the parse emits nothing (well-formed input)', () => {
    expect(collectImportDiagnostics(() => {})).toEqual([]);
  });
});

describe('reportImportDiagnostic', () => {
  it('pushes a structured crumb onto the collector when one is engaged', () => {
    const sink: ImportDiagnostic[] = [];
    reportImportDiagnostic(sink, ImportDiagnosticSeverity.Drop, 'awd2.skin-vertex-mismatch', 'buildAwdSkin', {
      actual: 3,
      expected: 4,
    });
    expect(sink).toHaveLength(1);
    expect(sink[0]).toEqual({
      detail: { actual: 3, expected: 4 },
      kind: 'awd2.skin-vertex-mismatch',
      origin: 'buildAwdSkin',
      severity: 'Drop',
    });
  });

  it('carries the detail through undefined when none is supplied', () => {
    const sink: ImportDiagnostic[] = [];
    reportImportDiagnostic(sink, ImportDiagnosticSeverity.Reject, 'md2.bad-magic', 'parseMd2');
    expect(sink[0].detail).toBeUndefined();
    expect(sink[0].severity).toBe('Reject');
  });

  it('does nothing (no throw, no allocation) when the collector is undefined — the default silent path', () => {
    expect(() =>
      reportImportDiagnostic(undefined, ImportDiagnosticSeverity.Drop, 'gltf.accessor-out-of-bounds', 'readAccessor'),
    ).not.toThrow();
  });
});
