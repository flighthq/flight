import { createSignal, signalNoop } from './signal';

describe('createSignal', () => {
  it('initializes with data=null', () => {
    const signal = createSignal<() => void>();
    expect(signal.data).toBeNull();
  });
});

describe('signalNoop', () => {
  it('is a function', () => {
    expect(typeof signalNoop).toBe('function');
  });

  it('returns undefined', () => {
    expect(signalNoop()).toBeUndefined();
  });
});
