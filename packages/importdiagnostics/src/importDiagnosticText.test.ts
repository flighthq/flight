import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { formatImportDiagnostic } from './importDiagnosticText';

describe('formatImportDiagnostic', () => {
  it('renders severity, origin, and kind with detail keys sorted', () => {
    const line = formatImportDiagnostic({
      detail: { expected: 4, actual: 3 },
      kind: 'awd2.skin-vertex-mismatch',
      origin: 'buildAwdSkin',
      severity: ImportDiagnosticSeverity.Drop,
    });
    expect(line).toBe('Drop buildAwdSkin: awd2.skin-vertex-mismatch actual=3 expected=4');
  });

  it('omits the detail section when there is no detail', () => {
    const line = formatImportDiagnostic({
      kind: 'md2.bad-magic',
      origin: 'parseMd2',
      severity: ImportDiagnosticSeverity.Reject,
    });
    expect(line).toBe('Reject parseMd2: md2.bad-magic');
  });
});
