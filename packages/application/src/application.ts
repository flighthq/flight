import { createSignal, emitSignal } from '@flighthq/signals';
import type { Application } from '@flighthq/types';

const kExit = Symbol();
const kLoop = Symbol();

export function attachApplicationExit(app: Application): void {
  app.observers.get(kExit)?.();
  const handler = () => emitSignal(app.onExit);
  window.addEventListener('beforeunload', handler);
  app.observers.set(kExit, () => window.removeEventListener('beforeunload', handler));
}

export function createApplication(): Application {
  return {
    observers: new Map(),
    onExit: createSignal(),
    onRender: createSignal(),
    onUpdate: createSignal(),
  };
}

export function detachApplicationExit(app: Application): void {
  app.observers.get(kExit)?.();
  app.observers.delete(kExit);
}

export function disposeApplication(app: Application): void {
  for (const cleanup of app.observers.values()) cleanup();
  app.observers.clear();
}

export function startApplicationLoop(app: Application): void {
  app.observers.get(kLoop)?.();
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
  app.observers.set(kLoop, () => cancelAnimationFrame(rafId));
}

export function stopApplicationLoop(app: Application): void {
  app.observers.get(kLoop)?.();
  app.observers.delete(kLoop);
}
