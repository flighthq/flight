import { createSignal, emitSignal } from '@flighthq/signals';
import type { Signal } from '@flighthq/types';

export interface Application {
  frameRate: number | null;
  observers: Map<symbol, () => void>;
  onExit: Signal<() => void>;
  onRender: Signal<() => void>;
  onUpdate: Signal<(deltaTime: number) => void>;
}

const MAX_DELTA_TIME = 100;
const kExit = Symbol();
const kLoop = Symbol();

export function createApplication(): Application {
  return {
    frameRate: null,
    observers: new Map(),
    onExit: createSignal(),
    onRender: createSignal(),
    onUpdate: createSignal(),
  };
}

export function startApplicationLoop(app: Application): void {
  app.observers.get(kLoop)?.();
  let lastTime = -1;
  let timeElapsed = 0;
  let rafId = 0;

  function tick(time: number): void {
    const isFirstFrame = lastTime < 0;
    const rawDelta = isFirstFrame ? 0 : time - lastTime;
    lastTime = time;

    const { frameRate } = app;
    if (frameRate === null || isFirstFrame) {
      emitSignal(app.onUpdate, Math.min(rawDelta, MAX_DELTA_TIME));
      emitSignal(app.onRender);
      timeElapsed = 0;
    } else {
      timeElapsed += rawDelta;
      const framePeriod = 1000 / frameRate;
      if (timeElapsed >= framePeriod) {
        emitSignal(app.onUpdate, Math.min(timeElapsed, MAX_DELTA_TIME));
        emitSignal(app.onRender);
        timeElapsed %= framePeriod;
      }
    }

    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  app.observers.set(kLoop, () => cancelAnimationFrame(rafId));
}

export function stopApplicationLoop(app: Application): void {
  app.observers.get(kLoop)?.();
  app.observers.delete(kLoop);
}

export function attachApplicationExit(app: Application): void {
  app.observers.get(kExit)?.();
  const handler = () => emitSignal(app.onExit);
  window.addEventListener('beforeunload', handler);
  app.observers.set(kExit, () => window.removeEventListener('beforeunload', handler));
}

export function detachApplicationExit(app: Application): void {
  app.observers.get(kExit)?.();
  app.observers.delete(kExit);
}

export function disposeApplication(app: Application): void {
  for (const cleanup of app.observers.values()) cleanup();
  app.observers.clear();
}
