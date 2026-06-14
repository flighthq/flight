import { createSignal } from './signal';
import { connectSignalAtRate } from './throttle';

describe('connectSignalAtRate', () => {
  it('fires the slot only when accumulated delta reaches the period', () => {
    const source = createSignal<(delta: number) => void>();
    const fired: number[] = [];
    connectSignalAtRate(source, 10, (delta) => fired.push(delta)); // 10fps = 100ms period

    source.emit(40);
    source.emit(40);
    expect(fired).toHaveLength(0);

    source.emit(40); // total 120ms — crosses 100ms threshold
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeCloseTo(120);
  });

  it('accumulates remainder across firings', () => {
    const source = createSignal<(delta: number) => void>();
    const fired: number[] = [];
    connectSignalAtRate(source, 10, (delta) => fired.push(delta)); // 100ms period

    source.emit(110); // fires once, 10ms remainder
    source.emit(110); // 120ms total — fires again
    expect(fired).toHaveLength(2);
  });

  it('returns a cleanup that stops the slot', () => {
    const source = createSignal<(delta: number) => void>();
    let fired = 0;
    const detach = connectSignalAtRate(source, 10, () => fired++);

    detach();
    source.emit(200);
    expect(fired).toBe(0);
  });
});
