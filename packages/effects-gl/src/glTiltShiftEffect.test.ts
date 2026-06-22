import { applyTiltShiftEffectToGl, defaultGlTiltShiftEffectRunner } from './glTiltShiftEffect';

describe('applyTiltShiftEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyTiltShiftEffectToGl).toBe('function');
  });
});

describe('defaultGlTiltShiftEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlTiltShiftEffectRunner).toBe('function');
  });
});
