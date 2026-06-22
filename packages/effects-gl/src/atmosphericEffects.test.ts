import {
  applyGodRaysEffectToGl,
  applyScreenSpaceFogEffectToGl,
  applySsaoEffectToGl,
  applySsrEffectToGl,
  defaultGlGodRaysEffectRunner,
  defaultGlScreenSpaceFogEffectRunner,
  defaultGlSsaoEffectRunner,
  defaultGlSsrEffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToGl).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToGl).toBe('function');
  });
});

describe('applySsaoEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToGl).toBe('function');
  });
});

describe('applySsrEffectToGl', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToGl).toBe('function');
  });
});

describe('defaultGlGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultGlScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultGlSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsaoEffectRunner).toBe('function');
  });
});

describe('defaultGlSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultGlSsrEffectRunner).toBe('function');
  });
});
