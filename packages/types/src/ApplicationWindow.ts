import type { Entity } from './Entity';
import type { Signal } from './Signal';

export interface ApplicationWindow extends Entity {
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

export interface HostWindowAppearanceCapability extends Entity {
  setIcon?(win: ApplicationWindow, icon: string): void;
  setOpacity?(win: ApplicationWindow, opacity: number): void;
  setTitle(win: ApplicationWindow, title: string): void;
}

export interface HostWindowAttachCapability extends Entity {
  attach(win: ApplicationWindow, handle: NativeWindowHandle, ownership: WindowAttachmentOwnership): boolean;
}

export interface HostWindowAttentionCapability extends Entity {
  flashWindowFrame?(win: ApplicationWindow): void;
  requestAttention(win: ApplicationWindow, attention: boolean): void;
}

export interface HostWindowContentProtectionCapability extends Entity {
  setContentProtection(win: ApplicationWindow, enabled: boolean): void;
}

export interface HostWindowFocusCapability extends Entity {
  focus(win: ApplicationWindow): void;
}

export interface HostWindowFullscreenCapability extends Entity {
  setFullscreen(win: ApplicationWindow, fullscreen: boolean): void;
}

export interface HostWindowGeometryCapability extends Entity {
  center?(win: ApplicationWindow): void;
  getBounds(win: ApplicationWindow, out: WindowBounds): WindowBounds;
  setPosition(win: ApplicationWindow, x: number, y: number): void;
  setSize(win: ApplicationWindow, width: number, height: number): void;
  subscribeMove?(listener: (x: number, y: number) => void): () => void;
  subscribeResize?(
    target: WindowResizeTargetHandle,
    listener: (width: number, height: number, devicePixelRatio: number) => void,
  ): () => void;
}

export interface HostWindowHierarchyCapability extends Entity {
  setParent(win: ApplicationWindow, parent: ApplicationWindow | null): void;
}

export interface HostWindowLifecycleCapability extends Entity {
  close(win: ApplicationWindow): void;
  open(win: ApplicationWindow, options: Readonly<WindowOptions>): boolean;
  subscribeClose?(onCloseRequest: () => boolean, onClose: () => void): () => void;
}

export interface HostWindowProgressCapability extends Entity {
  setProgress(win: ApplicationWindow, progress: number): void;
}

export interface HostWindowShadowCapability extends Entity {
  setHasShadow(win: ApplicationWindow, hasShadow: boolean): void;
}

export interface HostWindowShellCapability extends Entity {
  setMenuBarVisible?(win: ApplicationWindow, visible: boolean): void;
  setSkipTaskbar?(win: ApplicationWindow, skip: boolean): void;
}

export interface HostWindowSizeConstraintsCapability extends Entity {
  setMaximumSize(win: ApplicationWindow, width: number, height: number): void;
  setMinimumSize(win: ApplicationWindow, width: number, height: number): void;
}

export interface HostWindowStateCapability extends Entity {
  maximize(win: ApplicationWindow): void;
  minimize(win: ApplicationWindow): void;
  restore(win: ApplicationWindow): void;
}

export interface HostWindowVisibilityCapability extends Entity {
  hide(win: ApplicationWindow): void;
  show(win: ApplicationWindow): void;
  subscribeVisibility?(listener: (visible: boolean) => void): () => void;
}

export interface HostWindowZOrderCapability extends Entity {
  setAlwaysOnTop(win: ApplicationWindow, alwaysOnTop: boolean): void;
}
