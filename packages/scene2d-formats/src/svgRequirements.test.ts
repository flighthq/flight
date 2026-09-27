import { describe, expect, it } from 'vitest';

import { isReadableSvg, parseSvgRequirements } from './svgRequirements.ts';

describe('isReadableSvg', () => {
  it('returns false for non-SVG content', () => {
    expect(isReadableSvg('<html></html>')).toBe(false);
    expect(isReadableSvg('not xml')).toBe(false);
  });

  it('returns true for a valid SVG document', () => {
    expect(isReadableSvg('<svg></svg>')).toBe(true);
  });
});

describe('parseSvgRequirements', () => {
  it('emits a requirement for each counted kind', () => {
    const result = parseSvgRequirements('<svg><rect width="10" height="10"/><text>hi</text></svg>');
    const keys = result.requirements.map((r) => r.key);
    expect(keys).toContain('svg.geometry');
    expect(keys).toContain('svg.text');
    expect(keys).toContain('svg.container');
  });
});
