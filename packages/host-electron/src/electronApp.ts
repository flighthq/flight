import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostAppActivateProvider,
  HostAppActivationPolicyProvider,
  HostAppAllWindowsClosedProvider,
  HostAppBadgeProvider,
  HostAppDockProvider,
  HostAppFocusProvider,
  HostAppLocaleProvider,
  AppLoginItem,
  HostAppLoginItemProvider,
  HostAppNameProvider,
  HostAppNameWriteProvider,
  HostAppOpenFileProvider,
  HostAppPathProvider,
  AppPathKind,
  HostAppQuitProvider,
  HostAppQuitRequestProvider,
  HostAppReadyProvider,
  HostAppRecentDocumentsProvider,
  HostAppRelaunchProvider,
  HostAppSecondInstanceProvider,
  HostAppShowProvider,
  HostAppSingleInstanceProvider,
  HostAppUserModelIdProvider,
  HostAppVersionProvider,
  HostAppVisibilityQueryProvider,
  DesktopOsProfile,
  ElectronApi,
  ElectronAppCapabilitiesFor,
  ElectronCommonAppCapabilities,
  ElectronLinuxAppCapabilities,
  ElectronMacosAppCapabilities,
  ElectronWindowsAppCapabilities,
  Entity,
  EntityConstruction,
  HostAppHideProvider,
  HostAppCapabilities,
  MenuItemTemplate,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate';

type AppSubscribe = (event: string, listener: (...args: unknown[]) => void) => () => void;

function finishProvider<Provider extends Entity>(populate: (out: EntityConstruction<Provider>) => void): Provider {
  const out = allocateEntity<Provider>();
  populate(out);
  return finishEntity(out);
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
    const out = allocateEntity<ElectronCommonAppCapabilities>();
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
    return finishEntity(out);
  })();

  if (profile === 'macos') {
    const macos = allocateEntity<ElectronMacosAppCapabilities>();
    populateElectronHostAppMacos(
      macos,
      common,
      electronHostAppActivate(electron),
      electronHostAppActivationPolicy(electron),
      electronHostAppBadge(electron),
      electronHostAppDock(electron),
      electronHostAppHide(electron),
      electronHostAppHiddenQuery(electron),
      electronHostAppLoginItem(electron),
      electronHostAppOpenFile(electron),
      electronHostAppRecentDocuments(electron),
      electronHostAppShow(electron),
    );
    return finishEntity(macos) as ElectronAppCapabilitiesFor<Profile>;
  }

  if (profile === 'windows') {
    const win = allocateEntity<ElectronWindowsAppCapabilities>();
    populateElectronHostAppWindows(
      win,
      common,
      electronHostAppLoginItem(electron),
      electronHostAppRecentDocuments(electron),
      electronHostAppUserModelId(electron),
    );
    return finishEntity(win) as ElectronAppCapabilitiesFor<Profile>;
  }

  const linux = allocateEntity<ElectronLinuxAppCapabilities>();
  populateElectronHostAppLinux(linux, common, electronHostAppBadge(electron));
  return finishEntity(linux) as ElectronAppCapabilitiesFor<Profile>;
}

export function electronHostAppActivate(electron: ElectronApi): HostAppActivateProvider {
  return finishProvider((out) => populateElectronHostAppActivate(out, appSubscribe(electron)));
}

export function electronHostAppActivationPolicy(electron: ElectronApi): HostAppActivationPolicyProvider {
  return finishProvider((out) => populateElectronHostAppActivationPolicy(out, electron.app));
}

export function electronHostAppAllWindowsClosed(electron: ElectronApi): HostAppAllWindowsClosedProvider {
  return finishProvider((out) => populateElectronHostAppAllWindowsClosed(out, appSubscribe(electron)));
}

export function electronHostAppBadge(electron: ElectronApi): HostAppBadgeProvider {
  return finishProvider((out) => populateElectronHostAppBadge(out, electron.app));
}

export function electronHostAppDock(electron: ElectronApi): HostAppDockProvider {
  const dock = electron.app.dock;
  if (dock === undefined) throw new Error('Electron macOS app capabilities require app.dock');
  return finishProvider((out) => populateElectronHostAppDock(out, dock, electron));
}

export function electronHostAppFocus(electron: ElectronApi): HostAppFocusProvider {
  return finishProvider((out) => populateElectronHostAppFocus(out, electron.app));
}

export function electronHostAppHiddenQuery(electron: ElectronApi): HostAppVisibilityQueryProvider {
  return finishProvider((out) => populateElectronHostAppHiddenQuery(out, electron.app));
}

export function electronHostAppHide(electron: ElectronApi): HostAppHideProvider {
  return finishProvider((out) => populateElectronHostAppHide(out, electron.app));
}

export function electronHostAppLocale(electron: ElectronApi): HostAppLocaleProvider {
  return finishProvider((out) => populateElectronHostAppLocale(out, electron.app));
}

export function electronHostAppLoginItem(electron: ElectronApi): HostAppLoginItemProvider {
  return finishProvider((out) => populateElectronHostAppLoginItem(out, electron));
}

export function electronHostAppName(electron: ElectronApi): HostAppNameProvider {
  return finishProvider((out) => populateElectronHostAppName(out, electron.app));
}

export function electronHostAppNameWrite(electron: ElectronApi): HostAppNameWriteProvider {
  return finishProvider((out) => populateElectronHostAppNameWrite(out, electron.app));
}

export function electronHostAppOpenFile(electron: ElectronApi): HostAppOpenFileProvider {
  return finishProvider((out) => populateElectronHostAppOpenFile(out, appSubscribe(electron)));
}

export function electronHostAppPath(electron: ElectronApi): HostAppPathProvider {
  return finishProvider((out) => populateElectronHostAppPath(out, electron.app));
}

export function electronHostAppQuit(electron: ElectronApi): HostAppQuitProvider {
  return finishProvider((out) => populateElectronHostAppQuit(out, electron.app));
}

export function electronHostAppQuitRequest(electron: ElectronApi): HostAppQuitRequestProvider {
  return finishProvider((out) => populateElectronHostAppQuitRequest(out, appSubscribe(electron)));
}

export function electronHostAppReady(electron: ElectronApi): HostAppReadyProvider {
  return finishProvider((out) => populateElectronHostAppReady(out, appSubscribe(electron)));
}

export function electronHostAppRecentDocuments(electron: ElectronApi): HostAppRecentDocumentsProvider {
  return finishProvider((out) => populateElectronHostAppRecentDocuments(out, electron));
}

export function electronHostAppRelaunch(electron: ElectronApi): HostAppRelaunchProvider {
  return finishProvider((out) => populateElectronHostAppRelaunch(out, electron.app));
}

export function electronHostAppSecondInstance(electron: ElectronApi): HostAppSecondInstanceProvider {
  return finishProvider((out) => populateElectronHostAppSecondInstance(out, appSubscribe(electron)));
}

export function electronHostAppShow(electron: ElectronApi): HostAppShowProvider {
  return finishProvider((out) => populateElectronHostAppShow(out, electron.app));
}

export function electronHostAppSingleInstance(electron: ElectronApi): HostAppSingleInstanceProvider {
  return finishProvider((out) => populateElectronHostAppSingleInstance(out, electron.app));
}

export function electronHostAppUserModelId(electron: ElectronApi): HostAppUserModelIdProvider {
  return finishProvider((out) => populateElectronHostAppUserModelId(out, electron.app));
}

export function electronHostAppVersion(electron: ElectronApi): HostAppVersionProvider {
  return finishProvider((out) => populateElectronHostAppVersion(out, electron.app));
}

export function populateElectronHostAppActivate(
  out: EntityConstruction<HostAppActivateProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('activate', listener);
}

export function populateElectronHostAppActivationPolicy(
  out: EntityConstruction<HostAppActivationPolicyProvider>,
  app: ElectronApi['app'],
): void {
  out.setActivationPolicy = (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy);
}

export function populateElectronHostAppAllWindowsClosed(
  out: EntityConstruction<HostAppAllWindowsClosedProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('window-all-closed', listener);
}

export function populateElectronHostAppBadge(
  out: EntityConstruction<HostAppBadgeProvider>,
  app: ElectronApi['app'],
): void {
  out.setBadgeCount = async (count: number) => app.setBadgeCount(count);
}

export function populateElectronHostAppCommon(
  out: EntityConstruction<ElectronCommonAppCapabilities>,
  allWindowsClosed: HostAppAllWindowsClosedProvider,
  focus: HostAppFocusProvider,
  locale: HostAppLocaleProvider,
  name: HostAppNameProvider,
  nameWrite: HostAppNameWriteProvider,
  path: HostAppPathProvider,
  quit: HostAppQuitProvider,
  quitRequest: HostAppQuitRequestProvider,
  ready: HostAppReadyProvider,
  relaunch: HostAppRelaunchProvider,
  secondInstance: HostAppSecondInstanceProvider,
  singleInstance: HostAppSingleInstanceProvider,
  version: HostAppVersionProvider,
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
  out: EntityConstruction<HostAppDockProvider>,
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

export function populateElectronHostAppFocus(
  out: EntityConstruction<HostAppFocusProvider>,
  app: ElectronApi['app'],
): void {
  out.focus = () => app.focus();
}

export function populateElectronHostAppHiddenQuery(
  out: EntityConstruction<HostAppVisibilityQueryProvider>,
  app: ElectronApi['app'],
): void {
  out.isAppHidden = () => app.isHidden();
}

export function populateElectronHostAppHide(
  out: EntityConstruction<HostAppHideProvider>,
  app: ElectronApi['app'],
): void {
  out.hideApp = () => app.hide();
}

export function populateElectronHostAppLinux(
  out: EntityConstruction<ElectronLinuxAppCapabilities>,
  common: Readonly<ElectronCommonAppCapabilities>,
  badge: HostAppBadgeProvider,
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

export function populateElectronHostAppLocale(
  out: EntityConstruction<HostAppLocaleProvider>,
  app: ElectronApi['app'],
): void {
  out.getLocale = () => app.getLocale();
  out.getPreferredSystemLanguages = () => app.getPreferredSystemLanguages();
  out.getSystemLocale = () => app.getSystemLocale();
}

export function populateElectronHostAppLoginItem(
  out: EntityConstruction<HostAppLoginItemProvider>,
  electron: ElectronApi,
): void {
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
  out: EntityConstruction<ElectronMacosAppCapabilities>,
  common: Readonly<ElectronCommonAppCapabilities>,
  activate: HostAppActivateProvider,
  activationPolicy: HostAppActivationPolicyProvider,
  badge: HostAppBadgeProvider,
  dock: HostAppDockProvider,
  hide: HostAppHideProvider,
  hiddenQuery: HostAppVisibilityQueryProvider,
  loginItem: HostAppLoginItemProvider,
  openFile: HostAppOpenFileProvider,
  recentDocuments: HostAppRecentDocumentsProvider,
  show: HostAppShowProvider,
): void {
  out.activate = activate;
  out.activationPolicy = activationPolicy;
  out.allWindowsClosed = common.allWindowsClosed;
  out.badge = badge;
  out.dock = dock;
  out.focus = common.focus;
  out.hide = hide;
  out.hiddenQuery = hiddenQuery;
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

export function populateElectronHostAppName(
  out: EntityConstruction<HostAppNameProvider>,
  app: ElectronApi['app'],
): void {
  out.getName = () => app.getName();
}

export function populateElectronHostAppNameWrite(
  out: EntityConstruction<HostAppNameWriteProvider>,
  app: ElectronApi['app'],
): void {
  out.setName = (name: string) => app.setName(name);
}

export function populateElectronHostAppOpenFile(
  out: EntityConstruction<HostAppOpenFileProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (path: string) => void) => {
    return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
  };
}

export function populateElectronHostAppPath(
  out: EntityConstruction<HostAppPathProvider>,
  app: ElectronApi['app'],
): void {
  out.getAppDirectoryPath = (kind: AppPathKind) => app.getPath(toElectronPathName(kind));
  out.getAppPath = () => app.getAppPath();
  out.getExecutablePath = () => app.getPath('exe');
}

export function populateElectronHostAppQuit(
  out: EntityConstruction<HostAppQuitProvider>,
  app: ElectronApi['app'],
): void {
  out.quit = () => app.quit();
}

export function populateElectronHostAppQuitRequest(
  out: EntityConstruction<HostAppQuitRequestProvider>,
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
  out: EntityConstruction<HostAppReadyProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('ready', listener);
}

export function populateElectronHostAppRecentDocuments(
  out: EntityConstruction<HostAppRecentDocumentsProvider>,
  electron: ElectronApi,
): void {
  out.addRecentDocument = (path: string) => electron.app.addRecentDocument(path);
  out.clearRecentDocuments = () => electron.app.clearRecentDocuments();
}

export function populateElectronHostAppRelaunch(
  out: EntityConstruction<HostAppRelaunchProvider>,
  app: ElectronApi['app'],
): void {
  out.relaunch = () => app.relaunch();
}

export function populateElectronHostAppSecondInstance(
  out: EntityConstruction<HostAppSecondInstanceProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (argv: readonly string[]) => void) => {
    return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
  };
}

export function populateElectronHostAppShow(
  out: EntityConstruction<HostAppShowProvider>,
  app: ElectronApi['app'],
): void {
  out.showApp = () => app.show();
}

export function populateElectronHostAppSingleInstance(
  out: EntityConstruction<HostAppSingleInstanceProvider>,
  app: ElectronApi['app'],
): void {
  out.hasSingleInstanceLock = () => app.hasSingleInstanceLock();
  out.releaseSingleInstanceLock = () => app.releaseSingleInstanceLock();
  out.requestSingleInstanceLock = () => app.requestSingleInstanceLock();
}

export function populateElectronHostAppUserModelId(
  out: EntityConstruction<HostAppUserModelIdProvider>,
  app: ElectronApi['app'],
): void {
  out.setUserModelId = (id: string) => app.setAppUserModelId(id);
}

export function populateElectronHostAppVersion(
  out: EntityConstruction<HostAppVersionProvider>,
  app: ElectronApi['app'],
): void {
  out.getVersion = () => app.getVersion();
}

export function populateElectronHostAppWindows(
  out: EntityConstruction<ElectronWindowsAppCapabilities>,
  common: Readonly<ElectronCommonAppCapabilities>,
  loginItem: HostAppLoginItemProvider,
  recentDocuments: HostAppRecentDocumentsProvider,
  userModelId: HostAppUserModelIdProvider,
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
