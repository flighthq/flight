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

export interface HostAppActivateCapability extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppActivationPolicyCapability extends Entity {
  setActivationPolicy(policy: AppActivationPolicy): void;
}

export interface HostAppAllWindowsClosedCapability extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppBadgeCapability extends Entity {
  setBadgeCount(count: number): Promise<boolean>;
}

export interface HostAppDockCapability extends Entity {
  bounceDock(): number;
  cancelAttention(id: number): void;
  cancelDockBounce(id: number): void;
  requestAttention(critical: boolean): number;
  setDockBadge(text: string): void;
  setDockMenu(items: readonly MenuItemTemplate[]): void;
}

export interface HostAppFocusCapability extends Entity {
  focus(): void;
}

export interface HostAppLocaleCapability extends Entity {
  getLocale(): string;
  getPreferredSystemLanguages(): readonly string[];
  getSystemLocale(): string;
}

export interface HostAppLoginItemCapability extends Entity {
  getLoginItem(): AppLoginItem;
  setLoginItem(settings: Readonly<AppLoginItemLike>): void;
}

export interface HostAppNameCapability extends Entity {
  getName(): string;
}

export interface HostAppNameWriteCapability extends Entity {
  setName(name: string): void;
}

export interface HostAppOpenFileCapability extends Entity {
  subscribe(listener: (path: string) => void): () => void;
}

export interface HostAppPathCapability extends Entity {
  getAppDirectoryPath(kind: AppPathKind): string;
  getAppPath(): string;
  getExecutablePath(): string;
}

export interface HostAppQuitCapability extends Entity {
  quit(): void;
}

export interface HostAppQuitRequestCapability extends Entity {
  subscribe(listener: (cancelHost: () => void) => void): () => void;
}

export interface HostAppReadyCapability extends Entity {
  subscribe(listener: () => void): () => void;
}

export interface HostAppRecentDocumentsCapability extends Entity {
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
}

export interface HostAppRelaunchCapability extends Entity {
  relaunch(): void;
}

export interface HostAppSecondInstanceCapability extends Entity {
  subscribe(listener: (argv: readonly string[]) => void): () => void;
}

export interface HostAppSingleInstanceCapability extends Entity {
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  requestSingleInstanceLock(): boolean;
}

export interface HostAppUserModelIdCapability extends Entity {
  setUserModelId(id: string): void;
}

export interface HostAppVersionCapability extends Entity {
  getVersion(): string;
}

export interface HostAppHideCapability extends Entity {
  hideApp(): void;
}

export interface HostAppShowCapability extends Entity {
  showApp(): void;
}
