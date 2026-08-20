import { findDegreeConstantRedefinitions, formatDegreeConstantReport } from './check-degree-constants';

const sources = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries));

describe('findDegreeConstantRedefinitions', () => {
  it('finds a local degree constant outside math', () => {
    const found = findDegreeConstantRedefinitions(
      sources({ 'packages/sensors/src/a.ts': 'const toRad = Math.PI / 180;' }),
    );

    expect(found).toEqual([{ file: 'packages/sensors/src/a.ts', line: 1, text: 'const toRad = Math.PI / 180;' }]);
  });

  it('finds the radian-to-degree direction too', () => {
    const found = findDegreeConstantRedefinitions(sources({ 'packages/x/src/a.ts': 'const d = 180 / Math.PI;' }));

    expect(found).toHaveLength(1);
  });

  it('leaves math itself alone, since that is where the constant lives', () => {
    expect(
      findDegreeConstantRedefinitions(
        sources({ 'packages/math/src/constants.ts': 'export const DEG_TO_RAD = Math.PI / 180;' }),
      ),
    ).toEqual([]);
  });

  // ★ THE EXEMPTION HAS TO BE TESTED, not just commented, because it is the one place the check
  // deliberately declines to fire. A test spelling the ratio out locally is an independent oracle;
  // importing the shared constant there would compare the code against itself.
  it('leaves a test file alone', () => {
    expect(
      findDegreeConstantRedefinitions(
        sources({ 'packages/geometry/src/a.test.ts': 'const DEG_TO_RAD = Math.PI / 180;' }),
      ),
    ).toEqual([]);
  });

  // The stated limit, asserted so nobody reads a silent run as "no hand-rolled conversions exist".
  it('does not see an inline conversion at a call site', () => {
    expect(
      findDegreeConstantRedefinitions(sources({ 'packages/x/src/a.ts': 'const r = (angle * Math.PI) / 180;' })),
    ).toEqual([]);
  });
});

describe('formatDegreeConstantReport', () => {
  // Zero violations over zero files is a different fact from zero over five thousand, so the count
  // travels with the verdict.
  it('prints the scanned count beside a clean verdict', () => {
    expect(formatDegreeConstantReport([], 5142)).toContain('5142 TypeScript files scanned');
  });

  it('names every violation with its file and line', () => {
    const text = formatDegreeConstantReport(
      [{ file: 'packages/x/src/a.ts', line: 7, text: 'const k = 180 / Math.PI;' }],
      10,
    );

    expect(text).toContain('packages/x/src/a.ts:7');
    expect(text).toContain('Import DEG_TO_RAD / RAD_TO_DEG');
  });
});
