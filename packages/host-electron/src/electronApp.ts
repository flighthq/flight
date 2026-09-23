import type {
  AppLoginItem,
  AppPathKind,
  DesktopOsProfile,
  ElectronApi,
  ElectronAppCapabilitiesFor,
  ElectronCommonAppCapabilities,
  ElectronLinuxAppCapabilities,
  ElectronMacosAppCapabilities,
  ElectronWindowsAppCapabilities,
  HostAppActivateCapability,
  HostAppActivationPolicyCapability,
  HostAppAllWindowsClosedCapability,
  HostAppBadgeCapability,
  HostAppCapabilities,
  HostAppDockCapability,
  HostAppFocusCapability,
  HostAppHideCapability,
  HostAppLocaleCapability,
  HostAppLoginItemCapability,
  HostAppNameCapability,
  HostAppNameWriteCapability,
  HostAppOpenFileCapability,
  HostAppPathCapability,
  HostAppQuitCapability,
  HostAppQuitRequestCapability,
  HostAppReadyCapability,
  HostAppRecentDocumentsCapability,
  HostAppRelaunchCapability,
  HostAppSecondInstanceCapability,
  HostAppShowCapability,
  HostAppSingleInstanceCapability,
  HostAppUserModelIdCapability,
  HostAppVersionCapability,
  MenuItemTemplate,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate';

type AppSubscribe = (event: string, listener: (...args: unknown[]) => void) => () => void;

function finishProvider<Provider>(populate: (out: Provider) => void): Provider {
  const out = {} as Provider;
  populate(out);
  return out;
}

function appSubscribe(electron: ElectronApi): AppSubscribe {
  return (event, listener) => {
    electron.app.on(event, listener);
    return () => electron.app.removeListener(event, listener);
  };
}

export function electronHostApp<Profile extends DesktopOsProfile>(
  electron: ElectronApi,
  profile: Profile,
): ElectronAppCapabilitiesFor<Profile> {
  const common = (() => {
    const out = {} as { -readonly [K in keyof ElectronCommonAppCapabilities]: ElectronCommonAppCapabilities[K] };
    populateElectronHostAppCommon(
      out,
      electronHostAppAllWindowsClosed(electron),
      electronHostAppFocus(electron),
      electronHostAppLocale(electron),
      electronHostAppName(electron),
      electronHostAppNameWrite(electron),
      electronHostAppPath(electron),
      electronHostAppQuit(electron),
      electronHostAppQuitRequest(electron),
      electronHostAppReady(electron),
      electronHostAppRelaunch(electron),
      electronHostAppSecondInstance(electron),
      electronHostAppSingleInstance(electron),
      electronHostAppVersion(electron),
    );
    return Object.freeze(out) as ElectronCommonAppCapabilities;
  })();

  if (profile === 'macos') {
    const macos = {} as { -readonly [K in keyof ElectronMacosAppCapabilities]: ElectronMacosAppCapabilities[K] };
    populateElectronHostAppMacos(
      macos,
      common,
      electronHostAppActivate(electron),
      electronHostAppActivationPolicy(electron),
      electronHostAppBadge(electron),
      electronHostAppDock(electron),
      electronHostAppHide(electron),
      electronHostAppLoginItem(electron),
      electronHostAppOpenFile(electron),
      electronHostAppRecentDocuments(electron),
      electronHostAppShow(electron),
    );
    return Object.freeze(macos) as ElectronAppCapabilitiesFor<Profile>;
  }

  if (profile === 'windows') {
    const win = {} as { -readonly [K in keyof ElectronWindowsAppCapabilities]: ElectronWindowsAppCapabilities[K] };
    populateElectronHostAppWindows(
      win,
      common,
      electronHostAppLoginItem(electron),
      electronHostAppRecentDocuments(electron),
      electronHostAppUserModelId(electron),
    );
    return Object.freeze(win) as ElectronAppCapabilitiesFor<Profile>;
  }

  const linux = {} as { -readonly [K in keyof ElectronLinuxAppCapabilities]: ElectronLinuxAppCapabilities[K] };
  populateElectronHostAppLinux(linux, common, electronHostAppBadge(electron));
  return Object.freeze(linux) as ElectronAppCapabilitiesFor<Profile>;
}

export function electronHostAppActivate(electron: ElectronApi): HostAppActivateCapability {
  return finishProvider((out) => populateElectronHostAppActivate(out, appSubscribe(electron)));
}

export function electronHostAppActivationPolicy(electron: ElectronApi): HostAppActivationPolicyCapability {
  return finishProvider((out) => populateElectronHostAppActivationPolicy(out, electron.app));
}

export function electronHostAppAllWindowsClosed(electron: ElectronApi): HostAppAllWindowsClosedCapability {
  return finishProvider((out) => populateElectronHostAppAllWindowsClosed(out, appSubscribe(electron)));
}

export function electronHostAppBadge(electron: ElectronApi): HostAppBadgeCapability {
  return finishProvider((out) => populateElectronHostAppBadge(out, electron.app));
}

export function electronHostAppDock(electron: ElectronApi): HostAppDockCapability {
  const dock = electron.app.dock;
  if (dock === undefined) throw new Error('Electron macOS app capabilities require app.dock');
  return finishProvider((out) => populateElectronHostAppDock(out, dock, electron));
}

export function electronHostAppFocus(electron: ElectronApi): HostAppFocusCapability {
  return finishProvider((out) => populateElectronHostAppFocus(out, electron.app));
}

export function electronHostAppHide(electron: ElectronApi): HostAppHideCapability {
  return finishProvider((out) => populateElectronHostAppHide(out, electron.app));
}

export function electronHostAppLocale(electron: ElectronApi): HostAppLocaleCapability {
  return finishProvider((out) => populateElectronHostAppLocale(out, electron.app));
}

export function electronHostAppLoginItem(electron: ElectronApi): HostAppLoginItemCapability {
  return finishProvider((out) => populateElectronHostAppLoginItem(out, electron));
}

export function electronHostAppName(electron: ElectronApi): HostAppNameCapability {
  return finishProvider((out) => populateElectronHostAppName(out, electron.app));
}

export function electronHostAppNameWrite(electron: ElectronApi): HostAppNameWriteCapability {
  return finishProvider((out) => populateElectronHostAppNameWrite(out, electron.app));
}

export function electronHostAppOpenFile(electron: ElectronApi): HostAppOpenFileCapability {
  return finishProvider((out) => populateElectronHostAppOpenFile(out, appSubscribe(electron)));
}

export function electronHostAppPath(electron: ElectronApi): HostAppPathCapability {
  return finishProvider((out) => populateElectronHostAppPath(out, electron.app));
}

export function electronHostAppQuit(electron: ElectronApi): HostAppQuitCapability {
  return finishProvider((out) => populateElectronHostAppQuit(out, electron.app));
}

export function electronHostAppQuitRequest(electron: ElectronApi): HostAppQuitRequestCapability {
  return finishProvider((out) => populateElectronHostAppQuitRequest(out, appSubscribe(electron)));
}

export function electronHostAppReady(electron: ElectronApi): HostAppReadyCapability {
  return finishProvider((out) => populateElectronHostAppReady(out, appSubscribe(electron)));
}

export function electronHostAppRecentDocuments(electron: ElectronApi): HostAppRecentDocumentsCapability {
  return finishProvider((out) => populateElectronHostAppRecentDocuments(out, electron));
}

export function electronHostAppRelaunch(electron: ElectronApi): HostAppRelaunchCapability {
  return finishProvider((out) => populateElectronHostAppRelaunch(out, electron.app));
}

export function electronHostAppSecondInstance(electron: ElectronApi): HostAppSecondInstanceCapability {
  return finishProvider((out) => populateElectronHostAppSecondInstance(out, appSubscribe(electron)));
}

export function electronHostAppShow(electron: ElectronApi): HostAppShowCapability {
  return finishProvider((out) => populateElectronHostAppShow(out, electron.app));
}

export function electronHostAppSingleInstance(electron: ElectronApi): HostAppSingleInstanceCapability {
  return finishProvider((out) => populateElectronHostAppSingleInstance(out, electron.app));
}

export function electronHostAppUserModelId(electron: ElectronApi): HostAppUserModelIdCapability {
  return finishProvider((out) => populateElectronHostAppUserModelId(out, electron.app));
}

export function electronHostAppVersion(electron: ElectronApi): HostAppVersionCapability {
  return finishProvider((out) => populateElectronHostAppVersion(out, electron.app));
}

export function populateElectronHostAppActivate(
  out: HostAppActivateCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('activate', listener);
}

export function populateElectronHostAppActivationPolicy(
  out: HostAppActivationPolicyCapability,
  app: ElectronApi['app'],
): void {
  out.setActivationPolicy = (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy);
}

export function populateElectronHostAppAllWindowsClosed(
  out: HostAppAllWindowsClosedCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('window-all-closed', listener);
}

export function populateElectronHostAppBadge(out: HostAppBadgeCapability, app: ElectronApi['app']): void {
  out.setBadgeCount = async (count: number) => app.setBadgeCount(count);
}

export function populateElectronHostAppCommon(
  out: { -readonly [K in keyof ElectronCommonAppCapabilities]: ElectronCommonAppCapabilities[K] },
  allWindowsClosed: HostAppAllWindowsClosedCapability,
  focus: HostAppFocusCapability,
  locale: HostAppLocaleCapability,
  name: HostAppNameCapability,
  nameWrite: HostAppNameWriteCapability,
  path: HostAppPathCapability,
  quit: HostAppQuitCapability,
  quitRequest: HostAppQuitRequestCapability,
  ready: HostAppReadyCapability,
  relaunch: HostAppRelaunchCapability,
  secondInstance: HostAppSecondInstanceCapability,
  singleInstance: HostAppSingleInstanceCapability,
  version: HostAppVersionCapability,
): void {
  out.allWindowsClosed = allWindowsClosed;
  out.focus = focus;
  out.locale = locale;
  out.name = name;
  out.nameWrite = nameWrite;
  out.path = path;
  out.quit = quit;
  out.quitRequest = quitRequest;
  out.ready = ready;
  out.relaunch = relaunch;
  out.secondInstance = secondInstance;
  out.singleInstance = singleInstance;
  out.version = version;
}

export function populateElectronHostAppDock(
  out: HostAppDockCapability,
  dock: NonNullable<ElectronApi['app']['dock']>,
  electron: ElectronApi,
): void {
  out.bounceDock = () => dock.bounce();
  out.cancelAttention = (id: number) => dock.cancelBounce(id);
  out.cancelDockBounce = (id: number) => dock.cancelBounce(id);
  out.requestAttention = (critical: boolean) => dock.bounce(critical ? 'critical' : 'informational');
  out.setDockBadge = (text: string) => dock.setBadge(text);
  out.setDockMenu = (items: readonly MenuItemTemplate[]) =>
    dock.setMenu(electron.Menu.buildFromTemplate(toElectronTemplate(items)));
}

export function populateElectronHostAppFocus(out: HostAppFocusCapability, app: ElectronApi['app']): void {
  out.focus = () => app.focus();
}

export function populateElectronHostAppHide(out: HostAppHideCapability, app: ElectronApi['app']): void {
  out.hideApp = () => app.hide();
}

export function populateElectronHostAppLinux(
  out: { -readonly [K in keyof ElectronLinuxAppCapabilities]: ElectronLinuxAppCapabilities[K] },
  common: Readonly<ElectronCommonAppCapabilities>,
  badge: HostAppBadgeCapability,
): void {
  out.allWindowsClosed = common.allWindowsClosed;
  out.badge = badge;
  out.focus = common.focus;
  out.locale = common.locale;
  out.name = common.name;
  out.nameWrite = common.nameWrite;
  out.path = common.path;
  out.quit = common.quit;
  out.quitRequest = common.quitRequest;
  out.ready = common.ready;
  out.relaunch = common.relaunch;
  out.secondInstance = common.secondInstance;
  out.singleInstance = common.singleInstance;
  out.version = common.version;
}

export function populateElectronHostAppLocale(out: HostAppLocaleCapability, app: ElectronApi['app']): void {
  out.getLocale = () => app.getLocale();
  out.getPreferredSystemLanguages = () => app.getPreferredSystemLanguages();
  out.getSystemLocale = () => app.getSystemLocale();
}

export function populateElectronHostAppLoginItem(out: HostAppLoginItemCapability, electron: ElectronApi): void {
  out.getLoginItem = () => {
    const settings = electron.app.getLoginItemSettings();
    return {
      args: [],
      openAsHidden: settings.openAsHidden,
      openAtLogin: settings.openAtLogin,
      path: '',
    } satisfies AppLoginItem;
  };
  out.setLoginItem = (settings: Parameters<NonNullable<HostAppCapabilities['loginItem']>['setLoginItem']>[0]) => {
    electron.app.setLoginItemSettings({
      args: settings.args ? [...settings.args] : undefined,
      openAsHidden: settings.openAsHidden,
      openAtLogin: settings.openAtLogin,
      path: settings.path,
    });
  };
}

export function populateElectronHostAppMacos(
  out: { -readonly [K in keyof ElectronMacosAppCapabilities]: ElectronMacosAppCapabilities[K] },
  common: Readonly<ElectronCommonAppCapabilities>,
  activate: HostAppActivateCapability,
  activationPolicy: HostAppActivationPolicyCapability,
  badge: HostAppBadgeCapability,
  dock: HostAppDockCapability,
  hide: HostAppHideCapability,
  loginItem: HostAppLoginItemCapability,
  openFile: HostAppOpenFileCapability,
  recentDocuments: HostAppRecentDocumentsCapability,
  show: HostAppShowCapability,
): void {
  out.activate = activate;
  out.activationPolicy = activationPolicy;
  out.allWindowsClosed = common.allWindowsClosed;
  out.badge = badge;
  out.dock = dock;
  out.focus = common.focus;
  out.hide = hide;
  out.locale = common.locale;
  out.loginItem = loginItem;
  out.name = common.name;
  out.nameWrite = common.nameWrite;
  out.openFile = openFile;
  out.path = common.path;
  out.quit = common.quit;
  out.quitRequest = common.quitRequest;
  out.ready = common.ready;
  out.recentDocuments = recentDocuments;
  out.relaunch = common.relaunch;
  out.secondInstance = common.secondInstance;
  out.show = show;
  out.singleInstance = common.singleInstance;
  out.version = common.version;
}

export function populateElectronHostAppName(out: HostAppNameCapability, app: ElectronApi['app']): void {
  out.getName = () => app.getName();
}

export function populateElectronHostAppNameWrite(out: HostAppNameWriteCapability, app: ElectronApi['app']): void {
  out.setName = (name: string) => app.setName(name);
}

export function populateElectronHostAppOpenFile(
  out: HostAppOpenFileCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (path: string) => void) => {
    return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
  };
}

export function populateElectronHostAppPath(out: HostAppPathCapability, app: ElectronApi['app']): void {
  out.getAppDirectoryPath = (kind: AppPathKind) => app.getPath(toElectronPathName(kind));
  out.getAppPath = () => app.getAppPath();
  out.getExecutablePath = () => app.getPath('exe');
}

export function populateElectronHostAppQuit(out: HostAppQuitCapability, app: ElectronApi['app']): void {
  out.quit = () => app.quit();
}

export function populateElectronHostAppQuitRequest(
  out: HostAppQuitRequestCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (cancelHost: () => void) => void) => {
    return subscribe('before-quit', (...args: unknown[]) => {
      const event = args[0] as { preventDefault?: () => void } | undefined;
      listener(() => event?.preventDefault?.());
    });
  };
}

export function populateElectronHostAppReady(
  out: HostAppReadyCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('ready', listener);
}

export function populateElectronHostAppRecentDocuments(
  out: HostAppRecentDocumentsCapability,
  electron: ElectronApi,
): void {
  out.addRecentDocument = (path: string) => electron.app.addRecentDocument(path);
  out.clearRecentDocuments = () => electron.app.clearRecentDocuments();
}

export function populateElectronHostAppRelaunch(out: HostAppRelaunchCapability, app: ElectronApi['app']): void {
  out.relaunch = () => app.relaunch();
}

export function populateElectronHostAppSecondInstance(
  out: HostAppSecondInstanceCapability,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (argv: readonly string[]) => void) => {
    return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
  };
}

export function populateElectronHostAppShow(out: HostAppShowCapability, app: ElectronApi['app']): void {
  out.showApp = () => app.show();
}

export function populateElectronHostAppSingleInstance(
  out: HostAppSingleInstanceCapability,
  app: ElectronApi['app'],
): void {
  out.hasSingleInstanceLock = () => app.hasSingleInstanceLock();
  out.releaseSingleInstanceLock = () => app.releaseSingleInstanceLock();
  out.requestSingleInstanceLock = () => app.requestSingleInstanceLock();
}

export function populateElectronHostAppUserModelId(out: HostAppUserModelIdCapability, app: ElectronApi['app']): void {
  out.setUserModelId = (id: string) => app.setAppUserModelId(id);
}

export function populateElectronHostAppVersion(out: HostAppVersionCapability, app: ElectronApi['app']): void {
  out.getVersion = () => app.getVersion();
}

export function populateElectronHostAppWindows(
  out: { -readonly [K in keyof ElectronWindowsAppCapabilities]: ElectronWindowsAppCapabilities[K] },
  common: Readonly<ElectronCommonAppCapabilities>,
  loginItem: HostAppLoginItemCapability,
  recentDocuments: HostAppRecentDocumentsCapability,
  userModelId: HostAppUserModelIdCapability,
): void {
  out.allWindowsClosed = common.allWindowsClosed;
  out.focus = common.focus;
  out.locale = common.locale;
  out.loginItem = loginItem;
  out.name = common.name;
  out.nameWrite = common.nameWrite;
  out.path = common.path;
  out.quit = common.quit;
  out.quitRequest = common.quitRequest;
  out.ready = common.ready;
  out.recentDocuments = recentDocuments;
  out.relaunch = common.relaunch;
  out.secondInstance = common.secondInstance;
  out.singleInstance = common.singleInstance;
  out.userModelId = userModelId;
  out.version = common.version;
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
}
