import type { Signal } from './Signal';

export interface ApplicationWindow {
  // Window title text. Reflected to the host chrome by setWindowTitle.
  title: string;
  // Top-left position in screen coordinates (logical pixels).
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  // Window state mirror. Commands update these and emit the matching signal; native backends also
  // update them when the OS changes state (user clicks minimize, etc.).
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
  focused: boolean;
  visible: boolean;
  resizable: boolean;
  alwaysOnTop: boolean;
  // Whether the window is hidden from the taskbar/dock switcher.
  skipTaskbar: boolean;
  // Window opacity in [0, 1]. 1 is fully opaque.
  opacity: number;
  // Icon resource path/URL shown in the title bar/taskbar. '' uses the host default.
  icon: string;
  // Size constraints in logical pixels. maxWidth/maxHeight of -1 mean unbounded.
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  onActivate: Signal<() => void>;
  onClose: Signal<() => void>;
  // Emitted before the window closes; a listener calls cancelSignal(win.onCloseRequest) to veto.
  // closeWindow/requestWindowClose check the cancelled flag and abort the close when set.
  onCloseRequest: Signal<() => void>;
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

// Initial state for openWindow. Omitted fields keep the window's current/default value.
export interface WindowOptions {
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  fullscreen?: boolean;
  minimized?: boolean;
  maximized?: boolean;
  visible?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  center?: boolean;
  // Whether the window has native chrome (title bar/border). Native hosts only.
  frame?: boolean;
  // Whether the window background is transparent. Native hosts only.
  transparent?: boolean;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Control seam for windowing: a host backend the window command functions delegate to. The web
// backend covers what a browser page-window can do (title, fullscreen, focus, popup move/resize);
// a native host (Electron/Tauri/C++) maps each ApplicationWindow to a real OS window. Every method
// takes the target window so the seam supports multiple windows.
export interface WindowBackend {
  open(win: ApplicationWindow, options: Readonly<WindowOptions>): boolean;
  close(win: ApplicationWindow): void;
  setTitle(win: ApplicationWindow, title: string): void;
  setPosition(win: ApplicationWindow, x: number, y: number): void;
  setSize(win: ApplicationWindow, width: number, height: number): void;
  getBounds(win: ApplicationWindow, out: WindowBounds): WindowBounds;
  minimize(win: ApplicationWindow): void;
  maximize(win: ApplicationWindow): void;
  restore(win: ApplicationWindow): void;
  focus(win: ApplicationWindow): void;
  show(win: ApplicationWindow): void;
  hide(win: ApplicationWindow): void;
  center(win: ApplicationWindow): void;
  setResizable(win: ApplicationWindow, resizable: boolean): void;
  setAlwaysOnTop(win: ApplicationWindow, alwaysOnTop: boolean): void;
  setMinimumSize(win: ApplicationWindow, width: number, height: number): void;
  setMaximumSize(win: ApplicationWindow, width: number, height: number): void;
  setFullscreen(win: ApplicationWindow, fullscreen: boolean): void;
  setIcon(win: ApplicationWindow, icon: string): void;
  setOpacity(win: ApplicationWindow, opacity: number): void;
  setSkipTaskbar(win: ApplicationWindow, skip: boolean): void;
  setMenuBarVisible(win: ApplicationWindow, visible: boolean): void;
  setParent(win: ApplicationWindow, parent: ApplicationWindow | null): void;
  // Taskbar/dock progress in [0, 1]; a negative value clears the indicator.
  setProgress(win: ApplicationWindow, progress: number): void;
  // Flashes the taskbar entry / bounces the dock to draw attention; false stops it.
  requestAttention(win: ApplicationWindow, attention: boolean): void;
}
