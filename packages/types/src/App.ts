import type { Entity } from './Entity';
import type { MenuItemTemplate } from './Menu';
import type { Signal } from './Signal';

// macOS activation policy controlling dock presence and Command-Tab visibility. 'regular' shows in
// the dock and switcher; 'accessory' hides from both (menu-bar/agent apps); 'prohibited' is fully
// background. No-op on non-macOS and web.
export type AppActivationPolicy = 'regular' | 'accessory' | 'prohibited';

// App login-item (launch-at-startup) settings.
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

// App event entity. Enable delivery with attachAppEvents; the signals stay inert until then.
export interface AppEvents extends Entity {
  onActivate: Signal<() => void>;
  onAllWindowsClosed: Signal<() => void>;
  onOpenFile: Signal<(path: string) => void>;
  // Emitted before the app quits; a listener calls cancelSignal(app.onQuitRequest) to veto.
  onQuitRequest: Signal<() => void>;
  onReady: Signal<() => void>;
  onSecondInstance: Signal<(argv: readonly string[]) => void>;
}

export type MobileOsProfile = 'android' | 'ios';

export interface HostAppActivateCapability {
  subscribe(listener: () => void): () => void;
}

export interface HostAppActivationPolicyCapability {
  setActivationPolicy(policy: AppActivationPolicy): void;
}

export interface HostAppAllWindowsClosedCapability {
  subscribe(listener: () => void): () => void;
}

export interface HostAppBadgeCapability {
  setBadgeCount(count: number): Promise<boolean>;
}

export interface HostAppDockCapability {
  bounceDock(): number;
  cancelAttention(id: number): void;
  cancelDockBounce(id: number): void;
  requestAttention(critical: boolean): number;
  setDockBadge(text: string): void;
  setDockMenu(items: readonly MenuItemTemplate[]): void;
}

export interface HostAppFocusCapability {
  focus(): void;
}

export interface HostAppLocaleCapability {
  getLocale(): string;
  getPreferredSystemLanguages(): readonly string[];
  getSystemLocale(): string;
}

export interface HostAppLoginItemCapability {
  getLoginItem(): AppLoginItem;
  setLoginItem(settings: Readonly<AppLoginItemLike>): void;
}

export interface HostAppNameCapability {
  getName(): string;
}

export interface HostAppNameWriteCapability {
  setName(name: string): void;
}

export interface HostAppOpenFileCapability {
  subscribe(listener: (path: string) => void): () => void;
}

export interface HostAppPathCapability {
  getAppDirectoryPath(kind: AppPathKind): string;
  getAppPath(): string;
  getExecutablePath(): string;
}

export interface HostAppQuitCapability {
  quit(): void;
}

export interface HostAppQuitRequestCapability {
  subscribe(listener: (cancelHost: () => void) => void): () => void;
}

export interface HostAppReadyCapability {
  subscribe(listener: () => void): () => void;
}

export interface HostAppRecentDocumentsCapability {
  addRecentDocument(path: string): void;
  clearRecentDocuments(): void;
}

export interface HostAppRelaunchCapability {
  relaunch(): void;
}

export interface HostAppSecondInstanceCapability {
  subscribe(listener: (argv: readonly string[]) => void): () => void;
}

export interface HostAppSingleInstanceCapability {
  hasSingleInstanceLock(): boolean;
  releaseSingleInstanceLock(): void;
  requestSingleInstanceLock(): boolean;
}

export interface HostAppUserModelIdCapability {
  setUserModelId(id: string): void;
}

export interface HostAppVersionCapability {
  getVersion(): string;
}

export interface HostAppHideCapability {
  hideApp(): void;
}

export interface HostAppShowCapability {
  showApp(): void;
}
