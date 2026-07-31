import {
  applyTiltShiftEffectToGl,
  defaultGlTiltShiftEffectRunner,
  registerGlTiltShiftEffect,
} from './glTiltShiftEffect';

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

describe('registerGlTiltShiftEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerGlTiltShiftEffect).toBeTypeOf('function');
  });
});
