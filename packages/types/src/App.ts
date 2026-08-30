import type { Entity } from './Entity';
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
export interface App extends Entity {
  onActivate: Signal<() => void>;
  onAllWindowsClosed: Signal<() => void>;
  onOpenFile: Signal<(path: string) => void>;
  // Emitted before the app quits; a listener calls cancelSignal(app.onQuitRequest) to veto.
  onQuitRequest: Signal<() => void>;
  onReady: Signal<() => void>;
  onSecondInstance: Signal<(argv: readonly string[]) => void>;
}

export type MobileOsProfile = 'android' | 'ios';

export interface AppActivateBackend extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface AppActivationPolicyBackend extends Entity {
  setActivationPolicy(policy: AppActivationPolicy): void;
}

export interface AppAllWindowsClosedBackend extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface AppBadgeBackend extends Entity {
  setBadgeCount(count: number): boolean;
}

export interface AppDockBackend extends Entity {
  bounceDock(): number;
  cancelAttention(id: number): void;
  cancelDockBounce(id: number): void;
  requestAttention(critical: boolean): number;
  setDockBadge(text: string): void;
  setDockMenu(items: readonly MenuItemTemplate[]): void;
}

export interface AppFocusBackend extends Entity {
  focus(): void;
}

export interface AppLocaleBackend extends Entity {
  getLocale(): string;
  getPreferredSystemLanguages(): readonly string[];
  getSystemLocale(): string;
}

export interface AppLoginItemBackend extends Entity {
  getLoginItem(): AppLoginItem;
  setLoginItem(settings: Readonly<AppLoginItemLike>): void;
}

export interface AppNameBackend extends Entity {
  getName(): string;
}

export interface AppNameWriteBackend extends Entity {
  setName(name: string): void;
}

export interface AppOpenFileBackend extends Entity {
  subscribe(listener: (path: string) => void): () => void;
}

export interface AppPathBackend extends Entity {
  getAppDirectoryPath(kind: AppPathKind): string;
  getAppPath(): string;
  getExecutablePath(): string;
}

export interface AppQuitBackend extends Entity {
  quit(): void;
}

export interface AppQuitRequestBackend extends Entity {
  subscribe(listener: (cancelHost: () => void) => void): () => void;
}

export interface AppReadyBackend extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface AppRecentDocumentsBackend extends Entity {
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
}

export interface AppRelaunchBackend extends Entity {
  relaunch(): void;
}

export interface AppSecondInstanceBackend extends Entity {
  subscribe(listener: (argv: readonly string[]) => void): () => void;
}

export interface AppSingleInstanceBackend extends Entity {
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  requestSingleInstanceLock(): boolean;
}

export interface AppUserModelIdBackend extends Entity {
  setUserModelId(id: string): void;
}

export interface AppVersionBackend extends Entity {
  getVersion(): string;
}

export interface AppVisibilityCommandBackend extends Entity {
  hideApp(): void;
  showApp(): void;
}

export interface AppVisibilityQueryBackend extends Entity {
  isAppHidden(): boolean;
}
