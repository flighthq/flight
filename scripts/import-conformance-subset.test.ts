import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatImportConformanceSubset } from './import-conformance-subset';

describe('formatImportConformanceSubset', () => {
  it('reports outcomes with an explicit not-a-score warning', () => {
    expect(
      formatImportConformanceSubset([
        { outcome: 'passed', reference: 'a.swf' },
        { outcome: 'silentlyWrong', reference: 'b.swf' },
      ]),
    ).toBe(
      'Subset import outcomes only — not a conformance score.\n' +
        'Fixtures visited: 2\n' +
        'passed: 1\n' +
        'unsupportedClean: 0\n' +
        'importedWrong: 0\n' +
        'silentlyWrong: 1\n' +
        'threw: 0\n',
    );
  });

  it('has no dependency on the scoreboard formatter or its nested denominator vocabulary', () => {
    const source = readFileSync(join(import.meta.dirname, 'import-conformance-subset.ts'), 'utf8');
    expect(source).not.toMatch(/import-conformance-(core|score)/);
    expect(source).not.toMatch(/ImportConformanceScore|totalCapabilities|passedCapabilities|singleWitnessCapabilities/);
    expect(source).not.toMatch(/instrumented|provenance|summary/);
  });
});
