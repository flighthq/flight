import { createSignal, emitSignal } from '@flighthq/signals';
import type { Signal } from '@flighthq/types';

export interface ApplicationWindow {
  devicePixelRatio: number;
  height: number;
  observers: Map<symbol, () => void>;
  width: number;
  onActivate: Signal<() => void>;
  onClose: Signal<() => void>;
  onDeactivate: Signal<() => void>;
  onDropFile: Signal<(path: string) => void>;
  onFocusIn: Signal<() => void>;
  onFocusOut: Signal<() => void>;
  onFullscreenChanged: Signal<() => void>;
  onMaximize: Signal<() => void>;
  onMinimize: Signal<() => void>;
  onMove: Signal<() => void>;
  onOrientationChanged: Signal<() => void>;
  onRenderContextLost: Signal<() => void>;
  onRenderContextRestored: Signal<() => void>;
  onResize: Signal<() => void>;
  onRestore: Signal<() => void>;
}

const kDropFile = Symbol();
const kFocus = Symbol();
const kFullscreen = Symbol();
const kOrientation = Symbol();
const kRenderContext = Symbol();
const kResize = Symbol();
const kVisibility = Symbol();

export function attachWindowDropFile(win: ApplicationWindow, element: HTMLElement): void {
  win.observers.get(kDropFile)?.();
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer?.files ?? [])) {
      emitSignal(win.onDropFile, file.name);
    }
  };
  element.addEventListener('dragover', onDragOver);
  element.addEventListener('drop', onDrop);
  win.observers.set(kDropFile, () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('drop', onDrop);
  });
}

export function attachWindowFocus(win: ApplicationWindow, element: HTMLElement): void {
  win.observers.get(kFocus)?.();
  const onFocus = () => emitSignal(win.onFocusIn);
  const onBlur = () => emitSignal(win.onFocusOut);
  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', onBlur);
  win.observers.set(kFocus, () => {
    element.removeEventListener('focus', onFocus);
    element.removeEventListener('blur', onBlur);
  });
}

export function attachWindowFullscreen(win: ApplicationWindow): void {
  win.observers.get(kFullscreen)?.();
  const handler = () => emitSignal(win.onFullscreenChanged);
  document.addEventListener('fullscreenchange', handler);
  win.observers.set(kFullscreen, () => document.removeEventListener('fullscreenchange', handler));
}

export function attachWindowOrientation(win: ApplicationWindow): void {
  win.observers.get(kOrientation)?.();
  if (!screen.orientation) return;
  const handler = () => emitSignal(win.onOrientationChanged);
  screen.orientation.addEventListener('change', handler);
  win.observers.set(kOrientation, () => screen.orientation.removeEventListener('change', handler));
}

export function attachWindowRenderContext(win: ApplicationWindow, canvas: HTMLCanvasElement): void {
  win.observers.get(kRenderContext)?.();
  const onContextLost = (e: Event) => {
    e.preventDefault();
    emitSignal(win.onRenderContextLost);
  };
  const onContextRestored = () => emitSignal(win.onRenderContextRestored);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  win.observers.set(kRenderContext, () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  });
}

export function attachWindowResize(win: ApplicationWindow, element: HTMLElement): void {
  win.observers.get(kResize)?.();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      win.width = Math.round(entry.contentRect.width);
      win.height = Math.round(entry.contentRect.height);
      win.devicePixelRatio = window.devicePixelRatio || 1;
      emitSignal(win.onResize);
    }
  });
  observer.observe(element);
  win.observers.set(kResize, () => observer.disconnect());
}

export function attachWindowVisibility(win: ApplicationWindow): void {
  win.observers.get(kVisibility)?.();
  const handler = () => {
    if (document.hidden) {
      emitSignal(win.onDeactivate);
    } else {
      emitSignal(win.onActivate);
    }
  };
  document.addEventListener('visibilitychange', handler);
  win.observers.set(kVisibility, () => document.removeEventListener('visibilitychange', handler));
}

export function createApplicationWindow(): ApplicationWindow {
  return {
    devicePixelRatio: 1,
    height: 0,
    observers: new Map(),
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
  win.observers.get(kDropFile)?.();
  win.observers.delete(kDropFile);
}

export function detachWindowFocus(win: ApplicationWindow): void {
  win.observers.get(kFocus)?.();
  win.observers.delete(kFocus);
}

export function detachWindowFullscreen(win: ApplicationWindow): void {
  win.observers.get(kFullscreen)?.();
  win.observers.delete(kFullscreen);
}

export function detachWindowOrientation(win: ApplicationWindow): void {
  win.observers.get(kOrientation)?.();
  win.observers.delete(kOrientation);
}

export function detachWindowRenderContext(win: ApplicationWindow): void {
  win.observers.get(kRenderContext)?.();
  win.observers.delete(kRenderContext);
}

export function detachWindowResize(win: ApplicationWindow): void {
  win.observers.get(kResize)?.();
  win.observers.delete(kResize);
}

export function detachWindowVisibility(win: ApplicationWindow): void {
  win.observers.get(kVisibility)?.();
  win.observers.delete(kVisibility);
}

export function disposeApplicationWindow(win: ApplicationWindow): void {
  for (const cleanup of win.observers.values()) cleanup();
  win.observers.clear();
}

export function exitFullscreen(): Promise<void> {
  return document.exitFullscreen();
}

export function hardenElement(element: HTMLElement): void {
  element.style.touchAction = 'none';
  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  (element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor = 'transparent';
  if (element instanceof HTMLCanvasElement) {
    element.style.transform = 'translateZ(0)';
  }
}

export function requestFullscreen(element: HTMLElement): Promise<void> {
  return element.requestFullscreen();
}
