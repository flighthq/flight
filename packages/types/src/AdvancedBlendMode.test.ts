import { AdvancedBlendMode } from './AdvancedBlendMode';
import { BlendMode } from './BlendMode';

describe('AdvancedBlendMode', () => {
  it('carries the full destination-reading / non-separable set', () => {
    expect(Object.values(AdvancedBlendMode).sort()).toEqual(
      [
        'Color',
        'ColorBurn',
        'ColorDodge',
        'Darken',
        'Difference',
        'Exclusion',
        'HardLight',
        'Hue',
        'Lighten',
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

  // Overlap with the fixed-function enum is ALLOWED but must be CHOSEN. Darken/Lighten appear in both
  // because the two tiers answer different questions for them — MIN/MAX is cheap and exact for an opaque
  // backdrop, the effect is faithful under partial coverage — so a caller picks by content rather than by
  // capability. Pinning the intersection keeps the original guard alive: a mode that drifts into both
  // vocabularies by accident still fails here, and whoever adds one has to justify it in this list.
  it('overlaps the fixed-function BlendMode enum only where the overlap is deliberate', () => {
    const fixed = new Set<string>(Object.values(BlendMode));
    const overlap = Object.values(AdvancedBlendMode)
      .filter((mode) => fixed.has(mode))
      .sort();
    expect(overlap).toEqual([BlendMode.Darken, BlendMode.Lighten].sort());
  });

  // The half of the original rule that still holds unconditionally: an advanced-only mode must never be
  // assignable as a cheap node property, because there is no fixed-function realization to fall back to —
  // `node.blendMode = Overlay` silently rendering Normal is the bug the split exists to prevent.
  it('keeps every destination-reading mode out of the fixed-function enum', () => {
    const fixed = new Set<string>(Object.values(BlendMode));
    const bounceOnly = Object.values(AdvancedBlendMode).filter(
      (mode) => mode !== BlendMode.Darken && mode !== BlendMode.Lighten,
    );
    for (const mode of bounceOnly) expect(fixed.has(mode)).toBe(false);
  });
});
