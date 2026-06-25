import type { MenuItemTemplate } from './Menu';
import type { Signal } from './Signal';

// macOS activation policy controlling dock presence and Command-Tab visibility. 'regular' shows in
// the dock and switcher; 'accessory' hides from both (menu-bar/agent apps); 'prohibited' is fully
// background. No-op on non-macOS and web.
export type AppActivationPolicy = 'regular' | 'accessory' | 'prohibited';

// Application login-item (launch-at-startup) settings.
export interface AppLoginItem {
  // Whether the app launches automatically when the user logs in.
  openAtLogin: boolean;
  // Whether the app launches hidden/minimized (macOS).
  openAsHidden: boolean;
  // The executable path the login item points at. '' uses the host default.
  path: string;
  // Extra command-line arguments passed at login launch.
  args: readonly string[];
}

// Partial login-item settings for setAppLoginItem. Omitted fields keep their current values.
export interface AppLoginItemLike {
  openAtLogin?: boolean;
  openAsHidden?: boolean;
  path?: string;
  args?: readonly string[];
}

// App-identity-relative directory kinds resolved by getAppDirectoryPath. Bare OS directories
// (home, documents, downloads, appData, etc.) live in @flighthq/filesystem, not here.
export type AppPathKind = 'userData' | 'logs' | 'crashDumps';

// Application event entity. Enable delivery with attachApp; the signals stay inert until then.
export interface App {
  onActivate: Signal<() => void>;
  onAllWindowsClosed: Signal<() => void>;
  onOpenFile: Signal<(path: string) => void>;
  // Emitted before the app quits; a listener calls cancelSignal(app.onQuitRequest) to veto.
  onQuitRequest: Signal<() => void>;
  onReady: Signal<() => void>;
  onSecondInstance: Signal<(argv: readonly string[]) => void>;
}

// Event and control seam for application identity, lifecycle, single-instance locking, and the dock.
// The web backend wraps document/window/navigator; a native host drives the same callbacks and APIs.
export interface AppBackend {
  // Adds a path to the system's recent-documents list (Jump List / macOS recents). No-op on web.
  addRecentDocument(path: string): void;
  // Starts a dock bounce; returns a request id usable with cancelDockBounce, or -1 when unsupported.
  bounceDock(): number;
  // Cancels an app-level attention request started by requestAttention.
  cancelAttention(id: number): void;
  cancelDockBounce(id: number): void;
  // Clears the system's recent-documents list. No-op on web.
  clearRecentDocuments(): void;
  focus(): void;
  // The app-identity-relative directory path for the given kind; '' on web.
  getAppDirectoryPath(kind: AppPathKind): string;
  // The application bundle/exe directory path, or '' on web.
  getAppPath(): string;
  // The process command-line arguments, or [] on web.
  getCommandLine(): readonly string[];
  // The application executable path, or '' on web.
  getExecutablePath(): string;
  getLocale(): string;
  // The application login-item settings. Returns a default with openAtLogin: false on web.
  getLoginItem(): AppLoginItem;
  getName(): string;
  // The ranked list of preferred system languages, in preference order; [] when unavailable.
  getPreferredSystemLanguages(): readonly string[];
  // The OS-level system locale (may differ from the UI locale); '' when unavailable.
  getSystemLocale(): string;
  getVersion(): string;
  hasSingleInstanceLock(): boolean;
  // Hides the application (macOS hide-all-windows). Returns true when supported; false on web.
  hideApp(): boolean;
  // True when the application is hidden (macOS). Always false on web.
  isAppHidden(): boolean;
  quit(): void;
  relaunch(): void;
  releaseSingleInstanceLock(): void;
  // Draws OS-level attention (taskbar flash / dock bounce). Returns a request id for cancelAttention,
  // or -1 when unsupported.
  requestAttention(critical: boolean): number;
  requestSingleInstanceLock(): boolean;
  // Sets the macOS activation policy. No-op on non-macOS and web.
  setActivationPolicy(policy: AppActivationPolicy): void;
  // Sets the numeric app badge (taskbar overlay / dock / PWA navigator.setAppBadge). Returns false
  // when unsupported. This is the canonical home for the app badge (it is not on the tray).
  setBadgeCount(count: number): boolean;
  setDockBadge(text: string): void;
  // Sets the macOs dock menu (right-click the dock icon). No-op where there is no dock.
  setDockMenu(items: readonly MenuItemTemplate[]): void;
  // Updates login-item settings. Returns false when unsupported (web). Omitted fields keep values.
  setLoginItem(settings: Readonly<AppLoginItemLike>): boolean;
  // Sets the application name. Returns false when unsupported (web).
  setName(name: string): boolean;
  // Sets the Windows AppUserModelID. Returns false when unsupported.
  setUserModelId(id: string): boolean;
  // Shows the application after hideApp (macOS). Returns true when supported; false on web.
  showApp(): boolean;
  // Registers a listener invoked when the app is activated; returns an unsubscribe function.
  subscribeActivate(listener: () => void): () => void;
  // Registers a listener invoked when the last window closes; returns an unsubscribe function.
  subscribeAllWindowsClosed(listener: () => void): () => void;
  // Registers a listener invoked when a file open is requested; returns an unsubscribe function.
  subscribeOpenFile(listener: (path: string) => void): () => void;
  // Registers a listener invoked when a quit is requested; the listener receives a host-cancel
  // callback it may call to veto the quit at the OS level. Returns an unsubscribe function.
  subscribeQuitRequest(listener: (cancelHost: () => void) => void): () => void;
  // Registers a listener invoked when the app is ready; returns an unsubscribe function.
  subscribeReady(listener: () => void): () => void;
  // Registers a listener invoked when a second instance launches; returns an unsubscribe function.
  subscribeSecondInstance(listener: (argv: readonly string[]) => void): () => void;
}
