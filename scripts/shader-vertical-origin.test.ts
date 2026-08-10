import {
  convertsVerticalOrigin,
  findShaderVerticalOriginMismatches,
  formatShaderVerticalOriginReport,
  readsAbsoluteVerticalCoordinate,
} from './shader-vertical-origin';

// Synthetic shader text rather than the real effects, so the check keeps its meaning once every
// effect is correct and there is nothing left in the tree for it to find.

describe('convertsVerticalOrigin', () => {
  it('recognises a row inverted on either backend spelling', () => {
    expect(convertsVerticalOrigin('float y = 1.0 - v_texCoord.y;')).toBe(true);
    expect(convertsVerticalOrigin('let y = 1.0 - uv.y;')).toBe(true);
  });

  it('does not treat an unconverted read as a conversion', () => {
    expect(convertsVerticalOrigin('float y = v_texCoord.y * 4.0;')).toBe(false);
  });
});

describe('findShaderVerticalOriginMismatches', () => {
  it('reports a pair where neither side inverts the row', () => {
    const report = findShaderVerticalOriginMismatches(
      new Map([['Scanlines', { gl: 'sin(v_texCoord.y * n)', wgpu: 'sin(uv.y * n)' }]]),
    );

    expect(report.comparedPairs).toBe(1);
    expect(report.findings).toEqual([{ effect: 'Scanlines', glConverts: false, wgpuConverts: false }]);
  });

  it('reports a pair where BOTH sides invert the row', () => {
    // Two conversions cancel just as two omissions do — the invariant is exactly one, not at least one.
    const report = findShaderVerticalOriginMismatches(
      new Map([['Scanlines', { gl: 'sin((1.0 - v_texCoord.y) * n)', wgpu: 'sin((1.0 - uv.y) * n)' }]]),
    );

    expect(report.findings).toHaveLength(1);
  });

  it('accepts a pair where exactly one side inverts', () => {
    const report = findShaderVerticalOriginMismatches(
      new Map([['Scanlines', { gl: 'sin((1.0 - v_texCoord.y) * n)', wgpu: 'sin(uv.y * n)' }]]),
    );

    expect(report.findings).toEqual([]);
    expect(report.comparedPairs).toBe(1);
  });

  it('does not compare a pair whose only vertical read is a bounds test', () => {
    // Almost every sampling helper guards its reads this way, and the guard means the same thing from
    // either edge — counting it reported three false positives for every real finding.
    const guard = 'if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);';
    const report = findShaderVerticalOriginMismatches(new Map([['Bevel', { gl: guard, wgpu: guard }]]));

    expect(report.findings).toEqual([]);
    expect(report.comparedPairs).toBe(0);
    expect(report.unpairedOrVerticalFree).toBe(1);
  });

  it('separates finding nothing from having nothing to compare', () => {
    const empty = findShaderVerticalOriginMismatches(new Map());
    const flat = findShaderVerticalOriginMismatches(new Map([['Sepia', { gl: 'dot(c, w)', wgpu: 'dot(c, w)' }]]));

    expect(empty.comparedPairs).toBe(0);
    expect(flat.comparedPairs).toBe(0);
    expect(flat.unpairedOrVerticalFree).toBe(1);
  });
});

describe('formatShaderVerticalOriginReport', () => {
  it('prints the compared total beside an empty finding', () => {
    expect(formatShaderVerticalOriginReport({ comparedPairs: 6, findings: [], unpairedOrVerticalFree: 39 })).toContain(
      '0 of 6',
    );
  });

  it('names the effect and which way both sides went', () => {
    const text = formatShaderVerticalOriginReport({
      comparedPairs: 6,
      findings: [{ effect: 'Crt', glConverts: false, wgpuConverts: false }],
      unpairedOrVerticalFree: 39,
    });

    expect(text).toContain('Crt: both read the row directly');
  });
});

describe('readsAbsoluteVerticalCoordinate', () => {
  it('sees a row used in a computation', () => {
    expect(readsAbsoluteVerticalCoordinate('sin(uv.y * count)')).toBe(true);
  });

  it('does not see a row used only to test the frame bounds', () => {
    expect(readsAbsoluteVerticalCoordinate('if (uv.y < 0.0 || uv.y > 1.0) discard;')).toBe(false);
  });
});
