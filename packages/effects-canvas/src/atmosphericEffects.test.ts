import {
  applyGodRaysEffectToCanvas,
  applyScreenSpaceFogEffectToCanvas,
  applySsaoEffectToCanvas,
  applySsrEffectToCanvas,
  defaultCanvasGodRaysEffectRunner,
  defaultCanvasScreenSpaceFogEffectRunner,
  defaultCanvasSsaoEffectRunner,
  defaultCanvasSsrEffectRunner,
} from './atmosphericEffects';

describe('applyGodRaysEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyGodRaysEffectToCanvas).toBe('function');
  });
});

describe('applyScreenSpaceFogEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToCanvas).toBe('function');
  });
});

describe('applySsaoEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySsaoEffectToCanvas).toBe('function');
  });
});

describe('applySsrEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySsrEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasGodRaysEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasGodRaysEffectRunner).toBe('function');
  });
});

describe('defaultCanvasScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasScreenSpaceFogEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSsaoEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSsaoEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSsrEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSsrEffectRunner).toBe('function');
  });
});
