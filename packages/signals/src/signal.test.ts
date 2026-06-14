import { createSignal, nullSignalEmit } from './signal';

describe('createSignal', () => {
  it('initializes with data=null', () => {
    const signal = createSignal<() => void>();
    expect(signal.data).toBeNull();
  });
});

describe('nullSignalEmit', () => {
  it('is a function', () => {
    expect(typeof nullSignalEmit).toBe('function');
  });

  it('returns undefined', () => {
    expect(nullSignalEmit()).toBeUndefined();
  });
});
