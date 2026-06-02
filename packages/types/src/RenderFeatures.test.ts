import { RenderFeatures } from './RenderFeatures';

describe('RenderFeatures', () => {
  it('adds feature flags', () => {
    expect(RenderFeatures.add(RenderFeatures.Masks, RenderFeatures.ScrollRectangle)).toBe(
      RenderFeatures.Masks | RenderFeatures.ScrollRectangle,
    );
  });

  it('checks whether all requested feature flags are present', () => {
    const flags = RenderFeatures.Masks | RenderFeatures.ScrollRectangle;
    expect(RenderFeatures.has(flags, RenderFeatures.Masks)).toBe(true);
    expect(RenderFeatures.has(flags, RenderFeatures.Masks | RenderFeatures.ColorTransform)).toBe(false);
  });

  it('removes feature flags', () => {
    const flags = RenderFeatures.Masks | RenderFeatures.ScrollRectangle;
    expect(RenderFeatures.remove(flags, RenderFeatures.Masks)).toBe(RenderFeatures.ScrollRectangle);
  });
});
