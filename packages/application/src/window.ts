import { createSignal, emitSignal } from '@flighthq/signals';
import type { ApplicationWindow } from '@flighthq/types';

const kDropFile = Symbol();
const kFocus = Symbol();
const kFullscreen = Symbol();
const kOrientation = Symbol();
const kRenderContext = Symbol();
const kResize = Symbol();
const kVisibility = Symbol();

export function attachWindowDropFile(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kDropFile)?.();
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer?.files ?? [])) {
      emitSignal(win.onDropFile, file.name);
    }
  };
  element.addEventListener('dragover', onDragOver);
  element.addEventListener('drop', onDrop);
  observers.set(kDropFile, () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('drop', onDrop);
  });
}

export function attachWindowFocus(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFocus)?.();
  const onFocus = () => emitSignal(win.onFocusIn);
  const onBlur = () => emitSignal(win.onFocusOut);
  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', onBlur);
  observers.set(kFocus, () => {
    element.removeEventListener('focus', onFocus);
    element.removeEventListener('blur', onBlur);
  });
}

export function attachWindowFullscreen(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  const handler = () => emitSignal(win.onFullscreenChanged);
  document.addEventListener('fullscreenchange', handler);
  observers.set(kFullscreen, () => document.removeEventListener('fullscreenchange', handler));
}

export function attachWindowOrientation(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kOrientation)?.();
  if (!screen.orientation) return;
  const handler = () => emitSignal(win.onOrientationChanged);
  screen.orientation.addEventListener('change', handler);
  observers.set(kOrientation, () => screen.orientation.removeEventListener('change', handler));
}

export function attachWindowRenderContext(win: ApplicationWindow, canvas: HTMLCanvasElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderContext)?.();
  const onContextLost = (e: Event) => {
    e.preventDefault();
    emitSignal(win.onRenderContextLost);
  };
  const onContextRestored = () => emitSignal(win.onRenderContextRestored);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  observers.set(kRenderContext, () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  });
}

export function attachWindowResize(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kResize)?.();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      win.width = Math.round(entry.contentRect.width);
      win.height = Math.round(entry.contentRect.height);
      win.devicePixelRatio = window.devicePixelRatio || 1;
      emitSignal(win.onResize);
    }
  });
  observer.observe(element);
  observers.set(kResize, () => observer.disconnect());
}

export function attachWindowVisibility(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kVisibility)?.();
  const handler = () => {
    if (document.hidden) {
      emitSignal(win.onDeactivate);
    } else {
      emitSignal(win.onActivate);
    }
  };
  document.addEventListener('visibilitychange', handler);
  observers.set(kVisibility, () => document.removeEventListener('visibilitychange', handler));
}

export function createApplicationWindow(): ApplicationWindow {
  return {
    devicePixelRatio: 1,
    height: 0,
    width: 0,
    onActivate: createSignal(),
    onClose: createSignal(),
    onDeactivate: createSignal(),
    onDropFile: createSignal(),
    onFocusIn: createSignal(),
    onFocusOut: createSignal(),
    onFullscreenChanged: createSignal(),
    onMaximize: createSignal(),
    onMinimize: createSignal(),
    onMove: createSignal(),
    onOrientationChanged: createSignal(),
    onRenderContextLost: createSignal(),
    onRenderContextRestored: createSignal(),
    onResize: createSignal(),
    onRestore: createSignal(),
  };
}

export function detachWindowDropFile(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kDropFile)?.();
  observers.delete(kDropFile);
}

export function detachWindowFocus(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFocus)?.();
  observers.delete(kFocus);
}

export function detachWindowFullscreen(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  observers.delete(kFullscreen);
}

export function detachWindowOrientation(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kOrientation)?.();
  observers.delete(kOrientation);
}

export function detachWindowRenderContext(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderContext)?.();
  observers.delete(kRenderContext);
}

export function detachWindowResize(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kResize)?.();
  observers.delete(kResize);
}

export function detachWindowVisibility(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kVisibility)?.();
  observers.delete(kVisibility);
}

export function disposeApplicationWindow(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  for (const cleanup of observers.values()) cleanup();
  observers.clear();
}

export function exitApplicationFullscreen(): Promise<void> {
  return document.exitFullscreen();
}

export function lockApplicationPointer(element: HTMLElement): void {
  element.style.touchAction = 'none';
  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  (element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor = 'transparent';
  if (element instanceof HTMLCanvasElement) {
    element.style.transform = 'translateZ(0)';
  }
}

export function requestApplicationFullscreen(element: HTMLElement): Promise<void> {
  return element.requestFullscreen();
}

// Internal teardown registry, kept off the public ApplicationWindow entity (a side table like
// input's binding map). attach/detach/dispose track cleanup closures internally so callers hold
// nothing.
const _applicationWindowObservers = new WeakMap<ApplicationWindow, Map<symbol, () => void>>();

function getApplicationWindowObservers(win: ApplicationWindow): Map<symbol, () => void> {
  let observers = _applicationWindowObservers.get(win);
  if (observers === undefined) {
    observers = new Map();
    _applicationWindowObservers.set(win, observers);
  }
  return observers;
}
