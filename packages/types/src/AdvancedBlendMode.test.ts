import { AdvancedBlendMode } from './AdvancedBlendMode';
import { BlendMode } from './BlendMode';

describe('AdvancedBlendMode', () => {
  it('carries the full destination-reading / non-separable set', () => {
    expect(Object.values(AdvancedBlendMode).sort()).toEqual(
      [
        'Color',
        'ColorBurn',
        'ColorDodge',
        'Difference',
        'Exclusion',
        'HardLight',
        'Hue',
        'Luminosity',
        'Overlay',
        'Saturation',
        'SoftLight',
      ].sort(),
    );
  });

  it('uses canonical PascalCase values equal to their keys', () => {
    for (const key of Object.keys(AdvancedBlendMode)) {
      expect(AdvancedBlendMode[key as keyof typeof AdvancedBlendMode]).toBe(key);
    }
  });

  it('shares no member with the fixed-function BlendMode enum', () => {
    const fixed = new Set<string>(Object.values(BlendMode));
    for (const mode of Object.values(AdvancedBlendMode)) {
      expect(fixed.has(mode)).toBe(false);
    }
  });
});
