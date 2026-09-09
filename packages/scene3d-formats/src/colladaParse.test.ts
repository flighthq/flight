import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseCollada } from './colladaParse';

describe('parseCollada', () => {
  it('reads asset metadata and preserves Y-up identity', () => {
    const result = parseCollada(
      '<COLLADA version="1.4.1"><asset><contributor><authoring_tool>Tool</authoring_tool></contributor><copyright>Me</copyright><up_axis>Y_UP</up_axis></asset></COLLADA>',
    );
    expect(result.document.metadata).toEqual({ copyright: 'Me', generator: 'Tool', version: '1.4.1' });
    expect(result.upAxis).toBe('Y_UP');
    expect(result.rootTransform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
  it('reports coordinate conversion and unsupported profiles', () => {
    const result = parseCollada(
      '<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_effects><profile_GLSL/></library_effects></COLLADA>',
    );
    expect(result.diagnostics.map((d) => [d.kind, d.severity])).toEqual([
      ['collada.coordinate-conversion', ImportDiagnosticSeverity.Recover],
      ['collada.unsupported-profile', ImportDiagnosticSeverity.Skip],
    ]);
    expect(result.rootTransform[6]).toBe(-1);
  });
  it('rejects invalid XML documents and reports missing instance references', () => {
    expect(parseCollada('<not-collada/>').diagnostics[0].kind).toBe('collada.invalid-document');
    const result = parseCollada('<COLLADA><instance_geometry/></COLLADA>');
    expect(result.diagnostics[0].kind).toBe('collada.missing-reference');
  });
});
