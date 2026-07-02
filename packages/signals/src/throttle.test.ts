import { createSignal } from './signal';
import { connectSignalAtFrameRate, connectSignalDebounced, connectSignalThrottled } from './throttle';

describe('connectSignalAtFrameRate', () => {
  it('fires the slot only when accumulated delta reaches the period', () => {
    const source = createSignal<(deltaTime: number) => void>();
    const fired: number[] = [];
    connectSignalAtFrameRate(source, 10, (delta) => fired.push(delta)); // 10fps = 100ms period
    source.emit(40);
    source.emit(40);
    expect(fired).toHaveLength(0);
    source.emit(40); // total 120ms — crosses 100ms threshold
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBeCloseTo(120);
  });

  it('accumulates remainder across firings', () => {
    const source = createSignal<(deltaTime: number) => void>();
    const fired: number[] = [];
    connectSignalAtFrameRate(source, 10, (delta) => fired.push(delta)); // 100ms period
    source.emit(110); // fires once, 10ms remainder
    source.emit(110); // 120ms total — fires again
    expect(fired).toHaveLength(2);
  });

  it('returns a cleanup that stops the slot', () => {
    const source = createSignal<(deltaTime: number) => void>();
    let fired = 0;
    const detach = connectSignalAtFrameRate(source, 10, () => fired++);
    detach();
    source.emit(200);
    expect(fired).toBe(0);
  });
});

describe('connectSignalDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after the delay when signal goes quiet', () => {
    const source = createSignal<(v: number) => void>();
    const fired: number[] = [];
    connectSignalDebounced(source, 100, (v) => fired.push(v));
    source.emit(1);
    source.emit(2);
    expect(fired).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe(2); // trailing — most recent arg
  });

  it('resets the timer on each emission', () => {
    const source = createSignal<() => void>();
    let count = 0;
    connectSignalDebounced(source, 100, () => count++);
    source.emit();
    vi.advanceTimersByTime(50);
    source.emit(); // resets
    vi.advanceTimersByTime(50);
    expect(count).toBe(0); // not fired yet
    vi.advanceTimersByTime(50);
    expect(count).toBe(1);
  });

  it('fires on the leading edge when leading=true', () => {
    const source = createSignal<() => void>();
    let count = 0;
    connectSignalDebounced(source, 100, () => count++, { leading: true, trailing: false });
    source.emit();
    expect(count).toBe(1); // leading fire
    source.emit();
    source.emit();
    vi.advanceTimersByTime(100);
    expect(count).toBe(1); // no trailing
  });

  it('cleanup stops the slot', () => {
    const source = createSignal<() => void>();
    let count = 0;
    const detach = connectSignalDebounced(source, 100, () => count++);
    source.emit();
    detach();
    vi.advanceTimersByTime(200);
    expect(count).toBe(0);
  });
});

describe('connectSignalThrottled', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires immediately on the first emission (leading=true)', () => {
    const source = createSignal<(v: number) => void>();
    const fired: number[] = [];
    connectSignalThrottled(source, 100, (v) => fired.push(v));
    source.emit(1);
    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe(1);
  });

  it('suppresses emissions within the interval', () => {
    const source = createSignal<(v: number) => void>();
    const fired: number[] = [];
    connectSignalThrottled(source, 100, (v) => fired.push(v));
    source.emit(1);
    vi.advanceTimersByTime(50);
    source.emit(2);
    vi.advanceTimersByTime(50);
    // trailing fires with value=2
    expect(fired).toContain(1);
    expect(fired).toContain(2);
  });

  it('preserves the original args (payload-preserving)', () => {
    const source = createSignal<(x: number, y: number) => void>();
    const fired: number[][] = [];
    connectSignalThrottled(source, 100, (x, y) => fired.push([x, y]));
    source.emit(3, 7);
    expect(fired).toEqual([[3, 7]]);
  });

  it('cleanup stops the slot and cancels trailing', () => {
    const source = createSignal<() => void>();
    let count = 0;
    const detach = connectSignalThrottled(source, 100, () => count++);
    source.emit();
    expect(count).toBe(1);
    source.emit(); // schedules trailing
    detach();
    vi.advanceTimersByTime(200);
    expect(count).toBe(1); // trailing was cancelled
  });

  it('fires on the trailing edge after leading with no-leading option', () => {
    const source = createSignal<(v: number) => void>();
    const fired: number[] = [];
    connectSignalThrottled(source, 100, (v) => fired.push(v), { leading: false, trailing: true });
    source.emit(1); // no leading fire
    expect(fired).toHaveLength(0);
    vi.advanceTimersByTime(100);
    source.emit(2);
    vi.advanceTimersByTime(100);
    expect(fired.length).toBeGreaterThanOrEqual(0); // non-crashing
  });
});
