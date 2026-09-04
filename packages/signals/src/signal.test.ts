import { createSignal, initializeSignal } from './signal';

describe('createSignal', () => {
  it('initializes with data=null', () => {
    const signal = createSignal<() => void>();
    expect(signal.data).toBeNull();
  });

  it('initializes with a no-op emit', () => {
    const signal = createSignal<() => void>();
    expect(typeof signal.emit).toBe('function');
    expect(signal.emit()).toBeUndefined();
  });
});
describe('initializeSignal', () => {
  it('is the construction initializer of createSignal', () => {
    expect(typeof initializeSignal).toBe('function');
  });
});
