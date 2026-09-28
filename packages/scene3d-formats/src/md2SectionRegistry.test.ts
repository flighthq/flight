import { md2AnimationFamily } from './md2AnimationHandler.ts';
import { md2AllSectionHandlers } from './md2SectionRegistry.ts';
import { md2SkinFamily } from './md2SkinHandler.ts';

describe('md2AllSectionHandlers', () => {
  it('contains every family', () => {
    const all = new Set(md2AllSectionHandlers);
    for (const family of [md2SkinFamily, md2AnimationFamily]) {
      for (const handler of family) expect(all.has(handler)).toBe(true);
    }
    expect(md2AllSectionHandlers.length).toBe(md2SkinFamily.length + md2AnimationFamily.length);
  });

  // The skin handler appends the material index the mesh binds, so it must run before the mesh is
  // assembled. The parse runs handlers in the order the family gives them, which makes that order part of
  // the contract rather than an accident of how the array was written.
  it('orders the skin handler before the animation handler', () => {
    const features = md2AllSectionHandlers.map((handler) => handler.feature);
    expect(features.indexOf('Material')).toBeLessThan(features.indexOf('Animation'));
  });

  it('claims each feature once, so two handlers cannot claim the same one', () => {
    const features = md2AllSectionHandlers.map((handler) => handler.feature);
    expect(features.length).toBe(new Set(features).size);
  });
});
