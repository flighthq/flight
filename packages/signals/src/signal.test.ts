import { createSignal } from './signal';

describe('createSignal', () => {
  it('initializes with data=null', () => {
    const signal = createSignal<() => void>();
    expect(signal.data).toBeNull();
  });
});
