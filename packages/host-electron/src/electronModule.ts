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
  fs: ElectronFs;
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

// The minimal node:fs slice the storage backend needs. Injected on ElectronApi rather than imported
// so this package stays node:fs-dependency-free (matching the electron-free design principle); in a
// real Electron app the host passes the real node:fs module to registerElectronBackends.
export interface ElectronFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
  writeFileSync(path: string, data: string): void;
}

export interface ElectronApp {
  getName(): string;
  getVersion(): string;
  getLocale(): string;
  getSystemLocale(): string;
  getPreferredSystemLanguages(): string[];
  getAppPath(): string;
  getPath(name: string): string;
  setName(name: string): void;
  setAppUserModelId(id: string): void;
  setActivationPolicy(policy: 'regular' | 'accessory' | 'prohibited'): void;
  hide(): void;
  show(): void;
  isHidden(): boolean;
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
  getLoginItemSettings(): ElectronLoginItemSettings;
  setLoginItemSettings(settings: ElectronLoginItemSettingsLike): void;
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
  // Present on macOs only.
  dock?: ElectronDock;
}

export interface ElectronLoginItemSettings {
  openAtLogin: boolean;
  openAsHidden: boolean;
  executableWillLaunchAtLogin?: boolean;
}

export interface ElectronLoginItemSettingsLike {
  openAtLogin?: boolean;
  openAsHidden?: boolean;
  path?: string;
  args?: string[];
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
  readHtml(): string;
  writeHtml(markup: string): void;
  readRTF(): string;
  writeRTF(text: string): void;
  readBookmark(): { title: string; url: string };
  writeBookmark(title: string, url: string): void;
  readImage(): ElectronNativeImage;
  writeImage(image: ElectronNativeImage): void;
  read(format: string): string;
  write(data: ElectronClipboardData): void;
  has(format: string): boolean;
  availableFormats(): string[];
  clear(): void;
}

export interface ElectronClipboardData {
  text?: string;
  html?: string;
  rtf?: string;
  bookmark?: string;
  image?: ElectronNativeImage;
}

export interface ElectronShell {
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  trashItem(path: string): Promise<void>;
  beep(): void;
  readShortcutLink(shortcutPath: string): ElectronShortcutDetails;
  writeShortcutLink(
    shortcutPath: string,
    operation: 'create' | 'update' | 'replace',
    options: ElectronShortcutDetails,
  ): boolean;
}

export interface ElectronShortcutDetails {
  target: string;
  appUserModelId?: string;
  args?: string;
  description?: string;
  icon?: string;
  iconIndex?: number;
  cwd?: string;
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
  getCursorScreenPoint(): { x: number; y: number };
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
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
  getSystemIdleState(idleThresholdSeconds: number): 'active' | 'idle' | 'locked' | 'unknown';
  getSystemIdleTime(): number;
  onBatteryPower?: boolean;
}

export interface ElectronPowerSaveBlocker {
  start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
  stop(id: number): void;
  isStarted(id: number): boolean;
}

export interface ElectronNativeImageModule {
  createFromDataUrl(dataUrl: string): ElectronNativeImage;
  createFromPath(path: string): ElectronNativeImage;
}

export interface ElectronNativeImage {
  toDataUrl(): string;
  isEmpty(): boolean;
}

export interface ElectronIpcMain {
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

export interface ElectronAutoUpdater {
  setFeedUrl(options: { url: string }): void;
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
  setContentProtection(enable: boolean): void;
  setHasShadow(hasShadow: boolean): void;
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
  setImage(image: string | ElectronNativeImage): void;
  setPressedImage(image: string | ElectronNativeImage): void;
  setContextMenu(menu: ElectronMenu | null): void;
  popUpContextMenu(menu?: ElectronMenu, position?: { x: number; y: number }): void;
  setIgnoreDoubleClickEvents(ignore: boolean): void;
  displayBalloon(options: ElectronTrayBalloonOptions): void;
  removeBalloon(): void;
  getBounds(): ElectronRectangle;
  isDestroyed(): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
  destroy(): void;
}

export interface ElectronTrayBalloonOptions {
  icon?: string | ElectronNativeImage;
  iconType?: 'none' | 'info' | 'warning' | 'error';
  title: string;
  content: string;
  largeIcon?: boolean;
  noSound?: boolean;
  respectQuietTime?: boolean;
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
