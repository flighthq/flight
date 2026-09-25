import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface AppWindow extends Entity {
  // Window title text. Reflected to the host chrome by setWindowTitle.
  title: string;
  // Top-left position in screen coordinates (logical pixels).
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  // Window state mirror. Commands update these and emit the matching signal; native providers also
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

// A host-defined native window identity. Electron supplies a BrowserWindow, Tauri supplies its Window,
// and lower-level hosts may use an integer or opaque object handle, so the common contract deliberately
// does not narrow the representation.
export type NativeWindowHandle = unknown;

// Existing-window ownership is fixed when the handle is attached. Host-owned windows are detached from
// Flight on close but left alive; Flight-owned windows are closed by the provider after detachment.
export type WindowAttachmentOwnership = 'host' | 'flight';

// Provider-bound identity for the element whose content box drives attachWindowResize. The web host
// maps this opaque value to an Element; neutral application and native-host contracts never name DOM.
export type WindowResizeTargetHandle = Entity & { readonly __brand: 'WindowResizeTargetHandle' };

export interface HostWindowAppearanceCapability {
  setIcon?(win: AppWindow, icon: string): void;
  setOpacity?(win: AppWindow, opacity: number): void;
  setTitle(win: AppWindow, title: string): void;
}

export interface HostWindowAttachCapability {
  attach(win: AppWindow, handle: NativeWindowHandle, ownership: WindowAttachmentOwnership): boolean;
}

export interface HostWindowAttentionCapability {
  flashWindowFrame?(win: AppWindow): void;
  requestAttention(win: AppWindow, attention: boolean): void;
}

export interface HostWindowContentProtectionCapability {
  setContentProtection(win: AppWindow, enabled: boolean): void;
}

export interface HostWindowFocusCapability {
  focus(win: AppWindow): void;
}

export interface HostWindowFullscreenCapability {
  setFullscreen(win: AppWindow, fullscreen: boolean): void;
}

export interface HostWindowGeometryCapability {
  center?(win: AppWindow): void;
  getBounds(win: AppWindow, out: WindowBounds): WindowBounds;
  setPosition(win: AppWindow, x: number, y: number): void;
  setSize(win: AppWindow, width: number, height: number): void;
  subscribeMove?(listener: (x: number, y: number) => void): () => void;
  subscribeResize?(
    target: WindowResizeTargetHandle,
    listener: (width: number, height: number, devicePixelRatio: number) => void,
  ): () => void;
}

export interface HostWindowHierarchyCapability {
  setParent(win: AppWindow, parent: AppWindow | null): void;
}

export interface HostWindowLifecycleCapability {
  close(win: AppWindow): void;
  open(win: AppWindow, options: Readonly<WindowOptions>): boolean;
  subscribeClose?(onCloseRequest: () => boolean, onClose: () => void): () => void;
}

export interface HostWindowProgressCapability {
  setProgress(win: AppWindow, progress: number): void;
}

export interface HostWindowShadowCapability {
  setHasShadow(win: AppWindow, hasShadow: boolean): void;
}

export interface HostWindowShellCapability {
  setMenuBarVisible?(win: AppWindow, visible: boolean): void;
  setSkipTaskbar?(win: AppWindow, skip: boolean): void;
}

export interface HostWindowSizeConstraintsCapability {
  setMaximumSize(win: AppWindow, width: number, height: number): void;
  setMinimumSize(win: AppWindow, width: number, height: number): void;
  // Whether the user may resize the window. Optional because absence is the structural declaration
  // that the host cannot change it after open; web omits it, native hosts implement it.
  setResizable?(win: AppWindow, resizable: boolean): void;
}

export interface HostWindowStateCapability {
  maximize(win: AppWindow): void;
  minimize(win: AppWindow): void;
  restore(win: AppWindow): void;
}

export interface HostWindowVisibilityCapability {
  hide(win: AppWindow): void;
  show(win: AppWindow): void;
  subscribeVisibility?(listener: (visible: boolean) => void): () => void;
}

export interface HostWindowZOrderCapability {
  setAlwaysOnTop(win: AppWindow, alwaysOnTop: boolean): void;
}
