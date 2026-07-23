// The precise slice of the Tauri (v2) JavaScript API — `@tauri-apps/api` plus its official plugins —
// that Flight's host backends call. The real Tauri modules satisfy this structurally, so a consumer
// aggregates them and passes the object directly:
//
//   import * as app from '@tauri-apps/api/app';
//   import * as window from '@tauri-apps/api/window';
//   import * as menu from '@tauri-apps/api/menu';
//   import * as tray from '@tauri-apps/api/tray';
//   import * as clipboard from '@tauri-apps/plugin-clipboard-manager';
//   import * as dialog from '@tauri-apps/plugin-dialog';
//   import * as notification from '@tauri-apps/plugin-notification';
//   import * as opener from '@tauri-apps/plugin-opener';
//   import * as os from '@tauri-apps/plugin-os';
//   import * as globalShortcut from '@tauri-apps/plugin-global-shortcut';
//   import * as process from '@tauri-apps/plugin-process';
//   registerTauriBackends({ app, window, menu, tray, clipboard, dialog, notification, opener, os, globalShortcut, process });
//
// Typing it here (rather than importing `@tauri-apps/*`) keeps this package dependency-free and unit
// testable with a fake — and documents exactly which Tauri surface the seams require, which is the real
// coupling between Flight and a Tauri host. Members are intentionally minimal; widen only when a backend
// needs more. Note the wide async/sync gap: most Tauri calls are Promise-based, while several Flight
// seams (window/shortcut/app getters/menu install/tray create) are synchronous. Those adapters call the
// async Tauri method fire-and-forget and mirror state locally — see each adapter for the exact contract.

export interface TauriApi {
  app: TauriAppModule;
  clipboard: TauriClipboardManager;
  dialog: TauriDialogPlugin;
  globalShortcut: TauriGlobalShortcutPlugin;
  menu: TauriMenuModule;
  notification: TauriNotificationPlugin;
  opener: TauriOpenerPlugin;
  os: TauriOsModule;
  process: TauriProcessPlugin;
  tray: TauriTrayModule;
  window: TauriWindowModule;
}

// `@tauri-apps/api/app` — application identity/control. All async; the sync AppBackend getters are
// filled by prefetching these once at construction and caching the resolved value.
export interface TauriAppModule {
  getName(): Promise<string>;
  getVersion(): Promise<string>;
  hide(): Promise<void>;
  show(): Promise<void>;
}

// `@tauri-apps/plugin-process` — process lifecycle. `exit`/`relaunch` back AppBackend.quit/relaunch.
export interface TauriProcessPlugin {
  exit(code?: number): Promise<void>;
  relaunch(): Promise<void>;
}

// `@tauri-apps/plugin-clipboard-manager` — the async system clipboard. Only text + clear are modeled;
// Tauri's image flavor crosses as an `Image` object (not a data URL) and it has no HTML/RTF/bookmark
// read, so those ClipboardBackend methods report their sentinels.
export interface TauriClipboardManager {
  clear(): Promise<void>;
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface TauriDialogFilter {
  extensions: string[];
  name: string;
}

export interface TauriDialogOpenOptions {
  defaultPath?: string;
  directory?: boolean;
  filters?: TauriDialogFilter[];
  multiple?: boolean;
  title?: string;
}

export interface TauriDialogSaveOptions {
  defaultPath?: string;
  filters?: TauriDialogFilter[];
  title?: string;
}

export interface TauriDialogMessageOptions {
  cancelLabel?: string;
  kind?: 'info' | 'warning' | 'error';
  okLabel?: string;
  title?: string;
}

// `@tauri-apps/plugin-dialog` — native file/message dialogs. `open` returns real host path(s) or null;
// `message` shows a single-button acknowledgement; `ask`/`confirm` return a two-button boolean.
export interface TauriDialogPlugin {
  ask(message: string, options?: Readonly<TauriDialogMessageOptions>): Promise<boolean>;
  confirm(message: string, options?: Readonly<TauriDialogMessageOptions>): Promise<boolean>;
  message(message: string, options?: Readonly<TauriDialogMessageOptions>): Promise<void>;
  open(options?: Readonly<TauriDialogOpenOptions>): Promise<string | string[] | null>;
  save(options?: Readonly<TauriDialogSaveOptions>): Promise<string | null>;
}

export type TauriNotificationPermission = 'default' | 'denied' | 'granted';

export interface TauriNotificationOptions {
  body?: string;
  icon?: string;
  title: string;
}

// `@tauri-apps/plugin-notification` — desktop notifications. `sendNotification` is fire-and-forget (it
// silently no-ops without permission); permission state is async, so getPermission is served from a
// value prefetched at construction.
export interface TauriNotificationPlugin {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<TauriNotificationPermission>;
  sendNotification(options: Readonly<TauriNotificationOptions>): void;
}

// `@tauri-apps/plugin-opener` — open URLs/paths in the OS default handler and reveal files in the file
// manager. Backs ShellBackend's open/reveal surface; Tauri has no trash/shortcut-link/beep equivalent.
export interface TauriOpenerPlugin {
  openPath(path: string, openWith?: string): Promise<void>;
  openUrl(url: string, openWith?: string): Promise<void>;
  revealItemInDir(path: string): Promise<void>;
}

// `@tauri-apps/plugin-os` — OS identity. In Tauri v2 these are synchronous (resolved from values
// injected at startup), which is why the sync PlatformBackend maps onto them cleanly.
export interface TauriOsModule {
  arch(): string;
  locale(): string | null;
  platform(): string;
  version(): string;
}

// The payload `@tauri-apps/plugin-global-shortcut` delivers to a shortcut handler. `state` is
// 'Pressed' | 'Released'; the adapter filters to 'Pressed' so a single press fires once.
export interface TauriShortcutEvent {
  shortcut: string;
  state: string;
}

// `@tauri-apps/plugin-global-shortcut` — global OS hotkeys. All async, whereas ShortcutBackend is
// synchronous; the adapter fires register/unregister-and-forget and mirrors the registered set locally.
export interface TauriGlobalShortcutPlugin {
  isRegistered(shortcut: string): Promise<boolean>;
  register(shortcut: string, handler: (event: Readonly<TauriShortcutEvent>) => void): Promise<void>;
  unregister(shortcut: string): Promise<void>;
  unregisterAll(): Promise<void>;
}

// `@tauri-apps/api/menu` — native menus. Items and menus are built through async static factories
// (`Menu.new`, `MenuItem.new`, …); the adapter awaits the build then installs/pops, fire-and-forget.
export interface TauriMenuModule {
  Menu: TauriMenuFactory;
  MenuItem: TauriMenuItemFactory;
  PredefinedMenuItem: TauriPredefinedMenuItemFactory;
  Submenu: TauriSubmenuFactory;
}

// Tauri builds menus through async static methods literally named `new` (`Menu.new(...)`), not the
// `new` operator, so these factories declare a quoted `'new'` method rather than a construct signature.
export interface TauriMenuFactory {
  'new'(options?: Readonly<TauriMenuOptions>): Promise<TauriMenu>;
}

export interface TauriMenuItemFactory {
  'new'(options?: Readonly<TauriMenuItemOptions>): Promise<TauriMenuItemHandle>;
}

export interface TauriSubmenuFactory {
  'new'(options?: Readonly<TauriSubmenuOptions>): Promise<TauriMenuItemHandle>;
}

export interface TauriPredefinedMenuItemFactory {
  'new'(options: Readonly<TauriPredefinedMenuItemOptions>): Promise<TauriMenuItemHandle>;
}

export interface TauriMenuOptions {
  items?: TauriMenuItemHandle[];
}

export interface TauriMenuItemOptions {
  accelerator?: string;
  action?: (id: string) => void;
  enabled?: boolean;
  id?: string;
  text?: string;
}

export interface TauriSubmenuOptions {
  enabled?: boolean;
  items?: TauriMenuItemHandle[];
  text?: string;
}

// Predefined item, e.g. `{ item: 'Separator' }`.
export interface TauriPredefinedMenuItemOptions {
  item: string;
}

export interface TauriMenuItemHandle {
  readonly id: string;
}

export interface TauriMenu {
  popup(at?: Readonly<TauriPhysicalPositionLike>): Promise<void>;
  setAsAppMenu(): Promise<unknown>;
}

// `@tauri-apps/api/tray` — the system tray. `TrayIcon.new` is async and returns a handle; the sync
// TrayBackend.create returns a numeric id immediately and adopts the handle when it resolves.
export interface TauriTrayModule {
  TrayIcon: TauriTrayIconFactory;
}

// Like the menu factories, `TrayIcon.new(...)` is an async static method, not the `new` operator.
export interface TauriTrayIconFactory {
  'new'(options?: Readonly<TauriTrayIconOptions>): Promise<TauriTrayIcon>;
}

export interface TauriTrayIconOptions {
  action?: (event: Readonly<TauriTrayIconEvent>) => void;
  icon?: string;
  menu?: TauriMenu;
  title?: string;
  tooltip?: string;
}

// Tray pointer event. `type` is Tauri's discriminant ('Click' | 'DoubleClick' | 'Enter' | …); `button`
// distinguishes left/right on a click.
export interface TauriTrayIconEvent {
  button?: string;
  type: string;
}

export interface TauriTrayIcon {
  close(): Promise<void>;
  setIcon(icon: string | null): Promise<void>;
  setMenu(menu: TauriMenu | null): Promise<void>;
  setTitle(title: string | null): Promise<void>;
  setTooltip(tooltip: string | null): Promise<void>;
}

// `@tauri-apps/api/window` — the OS window. `getCurrentWindow` returns the window this webview is in.
// Every method is async; the sync WindowBackend fires them and forgets, mirroring state on the entity.
// Position/size take a `Logical*` value, constructed through the module's classes.
export interface TauriWindowModule {
  getCurrentWindow(): TauriWindow;
  LogicalPosition: TauriLogicalPositionConstructor;
  LogicalSize: TauriLogicalSizeConstructor;
}

export interface TauriLogicalPositionConstructor {
  new (x: number, y: number): TauriPhysicalPositionLike;
}

export interface TauriLogicalSizeConstructor {
  new (width: number, height: number): TauriLogicalSizeLike;
}

// Structural marker for a Tauri Logical/Physical position argument. Its fields are Tauri-internal; the
// adapter only ever constructs and forwards it, never reads it.
export interface TauriPhysicalPositionLike {
  readonly x: number;
  readonly y: number;
}

export interface TauriLogicalSizeLike {
  readonly height: number;
  readonly width: number;
}

// Unlisten handle a Tauri event subscription resolves to.
export type TauriUnlisten = () => void;

export interface TauriWindow {
  center(): Promise<void>;
  close(): Promise<void>;
  hide(): Promise<void>;
  maximize(): Promise<void>;
  minimize(): Promise<void>;
  onCloseRequested(handler: (event: TauriCloseRequestedEvent) => void): Promise<TauriUnlisten>;
  onFocusChanged(handler: (event: { payload: boolean }) => void): Promise<TauriUnlisten>;
  onMoved(handler: (event: { payload: TauriPhysicalPositionLike }) => void): Promise<TauriUnlisten>;
  onResized(handler: (event: { payload: TauriLogicalSizeLike }) => void): Promise<TauriUnlisten>;
  requestUserAttention(kind: number | null): Promise<void>;
  setAlwaysOnTop(alwaysOnTop: boolean): Promise<void>;
  setContentProtected(protected_: boolean): Promise<void>;
  setFocus(): Promise<void>;
  setFullscreen(fullscreen: boolean): Promise<void>;
  setIcon(icon: string): Promise<void>;
  setMaxSize(size: TauriLogicalSizeLike | null): Promise<void>;
  setMinSize(size: TauriLogicalSizeLike | null): Promise<void>;
  setPosition(position: TauriPhysicalPositionLike): Promise<void>;
  setResizable(resizable: boolean): Promise<void>;
  setShadow(enable: boolean): Promise<void>;
  setSize(size: TauriLogicalSizeLike): Promise<void>;
  setSkipTaskbar(skip: boolean): Promise<void>;
  setTitle(title: string): Promise<void>;
  show(): Promise<void>;
  unmaximize(): Promise<void>;
}

export interface TauriCloseRequestedEvent {
  preventDefault(): void;
}
