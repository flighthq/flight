import { createSignal } from './signal';

describe('createSignal', () => {
  it('initializes with head=null and canceled=false', () => {
    const signal = createSignal<() => void>();
    expect(signal.head).toBeNull();
    expect(signal.canceled).toBe(false);
  });
});
