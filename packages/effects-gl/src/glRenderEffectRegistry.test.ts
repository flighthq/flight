import { getGlRenderEffectRunner, hasGlRenderEffectRunner, registerGlRenderEffect } from './glRenderEffectRegistry';

describe('getGlRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof getGlRenderEffectRunner).toBe('function');
  });

  it('returns null for an unregistered kind', () => {
    const fakeState = {} as never;
    expect(getGlRenderEffectRunner(fakeState, 'UnknownEffect')).toBeNull();
  });
});

describe('hasGlRenderEffectRunner', () => {
  it('is a function', () => {
    expect(typeof hasGlRenderEffectRunner).toBe('function');
  });

  it('returns false for an unregistered kind', () => {
    const fakeState = {} as never;
    expect(hasGlRenderEffectRunner(fakeState, 'NotRegisteredEffect')).toBe(false);
  });

  it('returns true after a runner is registered', () => {
    const fakeState = {} as never;
    const runner = vi.fn();
    registerGlRenderEffect(fakeState, 'HasTestEffect', runner);
    expect(hasGlRenderEffectRunner(fakeState, 'HasTestEffect')).toBe(true);
  });
});

describe('registerGlRenderEffect', () => {
  it('is a function', () => {
    expect(typeof registerGlRenderEffect).toBe('function');
  });

  it('registers and retrieves a runner', () => {
    const fakeState = {} as never;
    const runner = vi.fn();
    registerGlRenderEffect(fakeState, 'TestEffect', runner);
    expect(getGlRenderEffectRunner(fakeState, 'TestEffect')).toBe(runner);
  });

  it('overwrites an existing runner under the same kind', () => {
    const fakeState = {} as never;
    const runnerA = vi.fn();
    const runnerB = vi.fn();
    registerGlRenderEffect(fakeState, 'TestEffect2', runnerA);
    registerGlRenderEffect(fakeState, 'TestEffect2', runnerB);
    expect(getGlRenderEffectRunner(fakeState, 'TestEffect2')).toBe(runnerB);
  });
});
