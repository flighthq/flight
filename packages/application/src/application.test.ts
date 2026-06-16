import { connectSignal } from '@flighthq/signals';

import {
  attachApplicationExit,
  createApplication,
  detachApplicationExit,
  disposeApplication,
  startApplicationLoop,
  stopApplicationLoop,
} from './application';

describe('attachApplicationExit', () => {
  it('emits onExit on beforeunload', () => {
    const app = createApplication();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(called).toBe(true);
  });

  it('replaces a previous exit listener when called again', () => {
    const app = createApplication();
    let count = 0;
    connectSignal(app.onExit, () => count++);

    attachApplicationExit(app);
    attachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(count).toBe(1);
  });
});

describe('createApplication', () => {
  it('returns signals with no side effects', () => {
    const app = createApplication();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();

    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });
    window.dispatchEvent(new Event('beforeunload'));
    expect(exitCalled).toBe(false);
  });
});

describe('detachApplicationExit', () => {
  it('removes the listener', () => {
    const app = createApplication();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachApplicationExit(app);
    detachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(called).toBe(false);
  });
});

describe('disposeApplication', () => {
  it('stops loop and removes exit listener', () => {
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(99));
    vi.stubGlobal('cancelAnimationFrame', caf);

    const app = createApplication();
    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });

    startApplicationLoop(app);
    attachApplicationExit(app);
    disposeApplication(app);

    expect(caf).toHaveBeenCalledWith(99);
    window.dispatchEvent(new Event('beforeunload'));
    expect(exitCalled).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('startApplicationLoop', () => {
  it('schedules a requestAnimationFrame', () => {
    const raf = vi.fn().mockReturnValue(1);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const app = createApplication();
    startApplicationLoop(app);

    expect(raf).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('replaces a previous loop when called again', () => {
    const caf = vi.fn();
    let rafId = 0;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn().mockImplementation(() => ++rafId),
    );
    vi.stubGlobal('cancelAnimationFrame', caf);

    const app = createApplication();
    startApplicationLoop(app);
    const firstId = rafId;
    startApplicationLoop(app);

    expect(caf).toHaveBeenCalledWith(firstId);
    vi.unstubAllGlobals();
  });

  it('emits onUpdate with delta and onRender on each tick', () => {
    let tickFn: ((time: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (fn: (time: number) => void) => {
      tickFn = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const app = createApplication();
    const updates: number[] = [];
    let renders = 0;
    connectSignal(app.onUpdate, (dt) => updates.push(dt));
    connectSignal(app.onRender, () => renders++);

    startApplicationLoop(app);
    tickFn!(0);
    tickFn!(100);

    expect(updates).toEqual([0, 100]);
    expect(renders).toBe(2);
    vi.unstubAllGlobals();
  });

  it('passes the real elapsed delta on large gaps', () => {
    let tickFn: ((time: number) => void) | null = null;
    vi.stubGlobal('requestAnimationFrame', (fn: (time: number) => void) => {
      tickFn = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startApplicationLoop(app);
    tickFn!(0);
    tickFn!(5000);

    expect(updates[1]).toBe(5000);
    vi.unstubAllGlobals();
  });
});

describe('stopApplicationLoop', () => {
  it('cancels the animation frame', () => {
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
    vi.stubGlobal('cancelAnimationFrame', caf);

    const app = createApplication();
    startApplicationLoop(app);
    stopApplicationLoop(app);

    expect(caf).toHaveBeenCalledWith(42);
    vi.unstubAllGlobals();
  });
});
