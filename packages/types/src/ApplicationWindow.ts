import type { Signal } from './Signal';

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
