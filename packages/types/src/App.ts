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

export interface HostAppActivateProvider extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppActivationPolicyProvider extends Entity {
  setActivationPolicy(policy: AppActivationPolicy): void;
}

export interface HostAppAllWindowsClosedProvider extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppBadgeProvider extends Entity {
  setBadgeCount(count: number): Promise<boolean>;
}

export interface HostAppDockProvider extends Entity {
  bounceDock(): number;
  cancelAttention(id: number): void;
  cancelDockBounce(id: number): void;
  requestAttention(critical: boolean): number;
  setDockBadge(text: string): void;
  setDockMenu(items: readonly MenuItemTemplate[]): void;
}

export interface HostAppFocusProvider extends Entity {
  focus(): void;
}

export interface HostAppLocaleProvider extends Entity {
  getLocale(): string;
  getPreferredSystemLanguages(): readonly string[];
  getSystemLocale(): string;
}

export interface HostAppLoginItemProvider extends Entity {
  getLoginItem(): AppLoginItem;
  setLoginItem(settings: Readonly<AppLoginItemLike>): void;
}

export interface HostAppNameProvider extends Entity {
  getName(): string;
}

export interface HostAppNameWriteProvider extends Entity {
  setName(name: string): void;
}

export interface HostAppOpenFileProvider extends Entity {
  subscribe(listener: (path: string) => void): () => void;
}

export interface HostAppPathProvider extends Entity {
  getAppDirectoryPath(kind: AppPathKind): string;
  getAppPath(): string;
  getExecutablePath(): string;
}

export interface HostAppQuitProvider extends Entity {
  quit(): void;
}

export interface HostAppQuitRequestProvider extends Entity {
  subscribe(listener: (cancelHost: () => void) => void): () => void;
}

export interface HostAppReadyProvider extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppRecentDocumentsProvider extends Entity {
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
}

export interface HostAppRelaunchProvider extends Entity {
  relaunch(): void;
}

export interface HostAppSecondInstanceProvider extends Entity {
  subscribe(listener: (argv: readonly string[]) => void): () => void;
}

export interface HostAppSingleInstanceProvider extends Entity {
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  requestSingleInstanceLock(): boolean;
}

export interface HostAppUserModelIdProvider extends Entity {
  setUserModelId(id: string): void;
}

export interface HostAppVersionProvider extends Entity {
  getVersion(): string;
}

export interface HostAppHideProvider extends Entity {
  hideApp(): void;
}

export interface HostAppShowProvider extends Entity {
  showApp(): void;
}

export interface HostAppVisibilityQueryProvider extends Entity {
  isAppHidden(): boolean;
}
