// The precise slice of Electron's main-process API that Flight's host backends use. The real
// `electron` module satisfies this structurally, so a consumer passes it directly:
//
//   import * as electron from 'electron';
//   registerElectronBackends(electron);
//
// Typing it here (rather than importing 'electron') keeps this package dependency-free and unit
// testable with a fake — and documents exactly which Electron surface the seams require, which is the
// real coupling between Flight and a host. Members are intentionally minimal; widen only when a
// backend needs more.

export interface ElectronApi {
  app: ElectronApp;
  clipboard: ElectronClipboard;
  shell: ElectronShell;
  dialog: ElectronDialog;
  globalShortcut: ElectronGlobalShortcut;
  screen: ElectronScreen;
  powerMonitor: ElectronPowerMonitor;
  powerSaveBlocker: ElectronPowerSaveBlocker;
  nativeImage: ElectronNativeImageModule;
  ipcMain: ElectronIpcMain;
  autoUpdater: ElectronAutoUpdater;
  BrowserWindow: ElectronBrowserWindowConstructor;
  Menu: ElectronMenuConstructor;
  Tray: ElectronTrayConstructor;
  Notification: ElectronNotificationConstructor;
}

export interface ElectronApp {
  getName(): string;
  getVersion(): string;
  getLocale(): string;
  quit(): void;
  exit(code?: number): void;
  relaunch(): void;
  focus(): void;
  requestSingleInstanceLock(): boolean;
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  setBadgeCount(count: number): boolean;
  setAsDefaultProtocolClient(scheme: string): boolean;
  removeAsDefaultProtocolClient(scheme: string): boolean;
  isDefaultProtocolClient(scheme: string): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  // Present on macOS only.
  dock?: ElectronDock;
}

export interface ElectronDock {
  bounce(type?: 'critical' | 'informational'): number;
  cancelBounce(id: number): void;
  setBadge(text: string): void;
  setMenu(menu: ElectronMenu): void;
}

export interface ElectronClipboard {
  readText(): string;
  writeText(text: string): void;
  readHTML(): string;
  writeHTML(markup: string): void;
  readRTF(): string;
  writeRTF(text: string): void;
  readBookmark(): { title: string; url: string };
  writeBookmark(title: string, url: string): void;
  readImage(): ElectronNativeImage;
  writeImage(image: ElectronNativeImage): void;
  clear(): void;
}

export interface ElectronShell {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  trashItem(path: string): Promise<void>;
  beep(): void;
}

export interface ElectronDialog {
  showOpenDialog(
    window: ElectronBrowserWindow | undefined,
    options: ElectronOpenDialogOptions,
  ): Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(
    window: ElectronBrowserWindow | undefined,
    options: ElectronSaveDialogOptions,
  ): Promise<{ canceled: boolean; filePath?: string }>;
  showMessageBox(
    window: ElectronBrowserWindow | undefined,
    options: ElectronMessageBoxOptions,
  ): Promise<{ response: number; checkboxChecked: boolean }>;
}

export interface ElectronOpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}

export interface ElectronSaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface ElectronMessageBoxOptions {
  type?: string;
  title?: string;
  message: string;
  detail?: string;
  buttons?: string[];
  defaultId?: number;
  cancelId?: number;
  checkboxLabel?: string;
  checkboxChecked?: boolean;
}

export interface ElectronGlobalShortcut {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  unregisterAll(): void;
  isRegistered(accelerator: string): boolean;
}

export interface ElectronScreen {
  getPrimaryDisplay(): ElectronDisplay;
  getAllDisplays(): ElectronDisplay[];
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}

export interface ElectronDisplay {
  id: number;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

export interface ElectronPowerMonitor {
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
  onBatteryPower?: boolean;
}

export interface ElectronPowerSaveBlocker {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface ElectronNativeImageModule {
  createFromDataURL(dataURL: string): ElectronNativeImage;
  createFromPath(path: string): ElectronNativeImage;
}

export interface ElectronNativeImage {
  toDataURL(): string;
  isEmpty(): boolean;
}

export interface ElectronIpcMain {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface ElectronAutoUpdater {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export interface ElectronBrowserWindowConstructor {
  new (options?: ElectronBrowserWindowOptions): ElectronBrowserWindow;
  getAllWindows(): ElectronBrowserWindow[];
  fromId(id: number): ElectronBrowserWindow | null;
}

export interface ElectronBrowserWindowOptions {
  title?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  resizable?: boolean;
  alwaysOnTop?: boolean;
  fullscreen?: boolean;
  show?: boolean;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  frame?: boolean;
  transparent?: boolean;
}

export interface ElectronRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectronBrowserWindow {
  id: number;
  // Content loading — not used by the window backend itself, but the escape hatch a host app needs
  // to put a page into the window (returned via getElectronBrowserWindow).
  loadURL(url: string): Promise<void>;
  loadFile(filePath: string): Promise<void>;
  setTitle(title: string): void;
  getTitle(): string;
  setPosition(x: number, y: number): void;
  setSize(width: number, height: number): void;
  getBounds(): ElectronRectangle;
  setBounds(bounds: Partial<ElectronRectangle>): void;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  restore(): void;
  isMinimized(): boolean;
  isMaximized(): boolean;
  focus(): void;
  show(): void;
  hide(): void;
  center(): void;
  setResizable(resizable: boolean): void;
  setAlwaysOnTop(flag: boolean): void;
  setMinimumSize(width: number, height: number): void;
  setMaximumSize(width: number, height: number): void;
  setFullScreen(flag: boolean): void;
  isFullScreen(): boolean;
  setIcon(icon: string | ElectronNativeImage): void;
  setOpacity(opacity: number): void;
  setProgressBar(progress: number): void;
  flashFrame(flag: boolean): void;
  setSkipTaskbar(skip: boolean): void;
  setMenuBarVisibility(visible: boolean): void;
  setParentWindow(parent: ElectronBrowserWindow | null): void;
  close(): void;
  destroy(): void;
  isDestroyed(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeAllListeners(event?: string): void;
}

export interface ElectronMenuConstructor {
  new (): ElectronMenu;
  buildFromTemplate(template: ElectronMenuItemOptions[]): ElectronMenu;
  setApplicationMenu(menu: ElectronMenu | null): void;
}

export interface ElectronMenu {
  popup(options?: { x?: number; y?: number }): void;
}

export interface ElectronMenuItemOptions {
  id?: string;
  label?: string;
  type?: string;
  role?: string;
  accelerator?: string;
  enabled?: boolean;
  checked?: boolean;
  click?: () => void;
  submenu?: ElectronMenuItemOptions[];
}

export interface ElectronTrayConstructor {
  new (image: string | ElectronNativeImage): ElectronTray;
}

export interface ElectronTray {
  setToolTip(tooltip: string): void;
  setTitle(title: string): void;
  setContextMenu(menu: ElectronMenu | null): void;
  on(event: string, listener: () => void): void;
  destroy(): void;
}

export interface ElectronNotificationConstructor {
  new (options: ElectronNotificationOptions): ElectronNotification;
  isSupported(): boolean;
}

export interface ElectronNotificationOptions {
  title: string;
  body?: string;
  icon?: string;
  silent?: boolean;
  actions?: { type: string; text: string }[];
}

export interface ElectronNotification {
  show(): void;
  close(): void;
  on(event: string, listener: (...args: unknown[]) => void): void;
}
