import { createSignal, noop } from './signal';

describe('createSignal', () => {
  it('initializes with data=null', () => {
    const signal = createSignal<() => void>();
    expect(signal.data).toBeNull();
  });
});

describe('noop', () => {
  it('is a function', () => {
    expect(typeof noop).toBe('function');
  });

  it('returns undefined', () => {
    expect(noop()).toBeUndefined();
  });
});
