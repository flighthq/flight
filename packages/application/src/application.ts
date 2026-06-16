import { createSignal, emitSignal } from '@flighthq/signals';
import type { Application } from '@flighthq/types';

const kExit = Symbol();
const kLoop = Symbol();

export function attachApplicationExit(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kExit)?.();
  const handler = () => emitSignal(app.onExit);
  window.addEventListener('beforeunload', handler);
  observers.set(kExit, () => window.removeEventListener('beforeunload', handler));
}

export function createApplication(): Application {
  return {
    onExit: createSignal(),
    onRender: createSignal(),
    onUpdate: createSignal(),
  };
}

export function detachApplicationExit(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kExit)?.();
  observers.delete(kExit);
}

export function disposeApplication(app: Application): void {
  const observers = getApplicationObservers(app);
  for (const cleanup of observers.values()) cleanup();
  observers.clear();
}

export function startApplicationLoop(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kLoop)?.();
  let lastTime = -1;
  let rafId = 0;

  function tick(time: number): void {
    const delta = lastTime < 0 ? 0 : time - lastTime;
    lastTime = time;
    emitSignal(app.onUpdate, delta);
    emitSignal(app.onRender);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  observers.set(kLoop, () => cancelAnimationFrame(rafId));
}

export function stopApplicationLoop(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kLoop)?.();
  observers.delete(kLoop);
}

// Internal teardown registry, kept off the public Application entity (a side table like input's
// binding map). attach/detach/dispose track cleanup closures internally so callers hold nothing.
const _applicationObservers = new WeakMap<Application, Map<symbol, () => void>>();

function getApplicationObservers(app: Application): Map<symbol, () => void> {
  let observers = _applicationObservers.get(app);
  if (observers === undefined) {
    observers = new Map();
    _applicationObservers.set(app, observers);
  }
  return observers;
}
