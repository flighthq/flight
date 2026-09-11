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
  EntityConstruction,
  HostAppHideProvider,
  HostAppCapabilities,
  MenuItemTemplate,
} from '@flighthq/types/contract';

import { toElectronTemplate } from './electronMenuTemplate';

export function createElectronAppCapabilities<Profile extends DesktopOsProfile>(
  electron: ElectronApi,
  profile: Profile,
): ElectronAppCapabilitiesFor<Profile>;
export function createElectronAppCapabilities(electron: ElectronApi, profile: 'macos'): ElectronMacosAppCapabilities;
export function createElectronAppCapabilities(
  electron: ElectronApi,
  profile: 'windows',
): ElectronWindowsAppCapabilities;
export function createElectronAppCapabilities(electron: ElectronApi, profile: 'linux'): ElectronLinuxAppCapabilities;
export function createElectronAppCapabilities(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): ElectronMacosAppCapabilities | ElectronWindowsAppCapabilities | ElectronLinuxAppCapabilities;
export function createElectronAppCapabilities(
  electron: ElectronApi,
  profile: DesktopOsProfile,
): ElectronMacosAppCapabilities | ElectronWindowsAppCapabilities | ElectronLinuxAppCapabilities {
  const app = electron.app;
  const subscribe = (event: string, listener: (...args: unknown[]) => void): (() => void) => {
    app.on(event, listener);
    return () => app.removeListener(event, listener);
  };
  const common = (() => {
    const out = allocateEntity<ElectronCommonAppCapabilities>();
    const allWindowsClosed = (() => {
      const b = allocateEntity<HostAppAllWindowsClosedProvider>();
      initializeAppAllWindowsClosedBackend(b, subscribe);
      return finishEntity(b);
    })();
    const focus = (() => {
      const b = allocateEntity<HostAppFocusProvider>();
      initializeAppFocusBackend(b, app);
      return finishEntity(b);
    })();
    const locale = (() => {
      const b = allocateEntity<HostAppLocaleProvider>();
      initializeAppLocaleBackend(b, app);
      return finishEntity(b);
    })();
    const name = (() => {
      const b = allocateEntity<HostAppNameProvider>();
      initializeAppNameBackend(b, app);
      return finishEntity(b);
    })();
    const nameWrite = (() => {
      const b = allocateEntity<HostAppNameWriteProvider>();
      initializeAppNameWriteBackend(b, app);
      return finishEntity(b);
    })();
    const path = (() => {
      const b = allocateEntity<HostAppPathProvider>();
      initializeAppPathBackend(b, app);
      return finishEntity(b);
    })();
    const quit = (() => {
      const b = allocateEntity<HostAppQuitProvider>();
      initializeAppQuitBackend(b, app);
      return finishEntity(b);
    })();
    const quitRequest = (() => {
      const b = allocateEntity<HostAppQuitRequestProvider>();
      initializeAppQuitRequestBackend(b, subscribe);
      return finishEntity(b);
    })();
    const ready = (() => {
      const b = allocateEntity<HostAppReadyProvider>();
      initializeAppReadyBackend(b, subscribe);
      return finishEntity(b);
    })();
    const relaunch = (() => {
      const b = allocateEntity<HostAppRelaunchProvider>();
      initializeAppRelaunchBackend(b, app);
      return finishEntity(b);
    })();
    const secondInstance = (() => {
      const b = allocateEntity<HostAppSecondInstanceProvider>();
      initializeAppSecondInstanceBackend(b, subscribe);
      return finishEntity(b);
    })();
    const singleInstance = (() => {
      const b = allocateEntity<HostAppSingleInstanceProvider>();
      initializeAppSingleInstanceBackend(b, app);
      return finishEntity(b);
    })();
    const version = (() => {
      const b = allocateEntity<HostAppVersionProvider>();
      initializeAppVersionBackend(b, app);
      return finishEntity(b);
    })();
    initializeElectronCommonAppCapabilities(
      out,
      allWindowsClosed,
      focus,
      locale,
      name,
      nameWrite,
      path,
      quit,
      quitRequest,
      ready,
      relaunch,
      secondInstance,
      singleInstance,
      version,
    );
    return finishEntity(out);
  })();

  if (profile === 'macos') {
    const dock = app.dock;
    if (dock === undefined) throw new Error('Electron macOS app capabilities require app.dock');
    const macos = allocateEntity<ElectronMacosAppCapabilities>();
    const activate = (() => {
      const b = allocateEntity<HostAppActivateProvider>();
      initializeAppActivateBackend(b, subscribe);
      return finishEntity(b);
    })();
    const activationPolicy = (() => {
      const b = allocateEntity<HostAppActivationPolicyProvider>();
      initializeAppActivationPolicyBackend(b, app);
      return finishEntity(b);
    })();
    const badge = (() => {
      const b = allocateEntity<HostAppBadgeProvider>();
      initializeAppBadgeBackend(b, app);
      return finishEntity(b);
    })();
    const dockBackend = (() => {
      const b = allocateEntity<HostAppDockProvider>();
      initializeAppDockBackend(b, dock, electron);
      return finishEntity(b);
    })();
    const hide = (() => {
      const b = allocateEntity<HostAppHideProvider>();
      initializeAppHideBackend(b, app);
      return finishEntity(b);
    })();
    const hiddenQuery = (() => {
      const b = allocateEntity<HostAppVisibilityQueryProvider>();
      initializeAppVisibilityQueryBackend(b, app);
      return finishEntity(b);
    })();
    const loginItem = createElectronLoginItemBackend(electron);
    const openFile = (() => {
      const b = allocateEntity<HostAppOpenFileProvider>();
      initializeAppOpenFileBackend(b, subscribe);
      return finishEntity(b);
    })();
    const recentDocuments = createElectronRecentDocumentsBackend(electron);
    const show = (() => {
      const b = allocateEntity<HostAppShowProvider>();
      initializeAppShowBackend(b, app);
      return finishEntity(b);
    })();
    initializeElectronMacosAppCapabilities(
      macos,
      common,
      activate,
      activationPolicy,
      badge,
      dockBackend,
      hide,
      hiddenQuery,
      loginItem,
      openFile,
      recentDocuments,
      show,
    );
    return finishEntity(macos);
  }

  if (profile === 'windows') {
    const win = allocateEntity<ElectronWindowsAppCapabilities>();
    const loginItem = createElectronLoginItemBackend(electron);
    const recentDocuments = createElectronRecentDocumentsBackend(electron);
    const userModelId = (() => {
      const b = allocateEntity<HostAppUserModelIdProvider>();
      initializeAppUserModelIdBackend(b, app);
      return finishEntity(b);
    })();
    initializeElectronWindowsAppCapabilities(win, common, loginItem, recentDocuments, userModelId);
    return finishEntity(win);
  }

  const linux = allocateEntity<ElectronLinuxAppCapabilities>();
  const badge = (() => {
    const b = allocateEntity<HostAppBadgeProvider>();
    initializeAppBadgeBackend(b, app);
    return finishEntity(b);
  })();
  initializeElectronLinuxAppCapabilities(linux, common, badge);
  return finishEntity(linux);
}

export function initializeAppActivateBackend(
  out: EntityConstruction<HostAppActivateProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('activate', listener);
}

export function initializeAppActivationPolicyBackend(
  out: EntityConstruction<HostAppActivationPolicyProvider>,
  app: ElectronApi['app'],
): void {
  out.setActivationPolicy = (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy);
}

export function initializeAppAllWindowsClosedBackend(
  out: EntityConstruction<HostAppAllWindowsClosedProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('window-all-closed', listener);
}

export function initializeAppBadgeBackend(
  out: EntityConstruction<HostAppBadgeProvider>,
  app: ElectronApi['app'],
): void {
  out.setBadgeCount = async (count: number) => app.setBadgeCount(count);
}

export function initializeAppDockBackend(
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

export function initializeAppFocusBackend(
  out: EntityConstruction<HostAppFocusProvider>,
  app: ElectronApi['app'],
): void {
  out.focus = () => app.focus();
}

export function initializeAppHideBackend(out: EntityConstruction<HostAppHideProvider>, app: ElectronApi['app']): void {
  out.hideApp = () => app.hide();
}

export function initializeAppLocaleBackend(
  out: EntityConstruction<HostAppLocaleProvider>,
  app: ElectronApi['app'],
): void {
  out.getLocale = () => app.getLocale();
  out.getPreferredSystemLanguages = () => app.getPreferredSystemLanguages();
  out.getSystemLocale = () => app.getSystemLocale();
}

export function initializeAppLoginItemBackend(
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

export function initializeAppNameBackend(out: EntityConstruction<HostAppNameProvider>, app: ElectronApi['app']): void {
  out.getName = () => app.getName();
}

export function initializeAppNameWriteBackend(
  out: EntityConstruction<HostAppNameWriteProvider>,
  app: ElectronApi['app'],
): void {
  out.setName = (name: string) => app.setName(name);
}

export function initializeAppOpenFileBackend(
  out: EntityConstruction<HostAppOpenFileProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (path: string) => void) => {
    return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
  };
}

export function initializeAppPathBackend(out: EntityConstruction<HostAppPathProvider>, app: ElectronApi['app']): void {
  out.getAppDirectoryPath = (kind: AppPathKind) => app.getPath(toElectronPathName(kind));
  out.getAppPath = () => app.getAppPath();
  out.getExecutablePath = () => app.getPath('exe');
}

export function initializeAppQuitBackend(out: EntityConstruction<HostAppQuitProvider>, app: ElectronApi['app']): void {
  out.quit = () => app.quit();
}

export function initializeAppQuitRequestBackend(
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

export function initializeAppReadyBackend(
  out: EntityConstruction<HostAppReadyProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('ready', listener);
}

export function initializeAppRecentDocumentsBackend(
  out: EntityConstruction<HostAppRecentDocumentsProvider>,
  electron: ElectronApi,
): void {
  out.addRecentDocument = (path: string) => electron.app.addRecentDocument(path);
  out.clearRecentDocuments = () => electron.app.clearRecentDocuments();
}

export function initializeAppRelaunchBackend(
  out: EntityConstruction<HostAppRelaunchProvider>,
  app: ElectronApi['app'],
): void {
  out.relaunch = () => app.relaunch();
}

export function initializeAppSecondInstanceBackend(
  out: EntityConstruction<HostAppSecondInstanceProvider>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (argv: readonly string[]) => void) => {
    return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
  };
}

export function initializeAppShowBackend(out: EntityConstruction<HostAppShowProvider>, app: ElectronApi['app']): void {
  out.showApp = () => app.show();
}

export function initializeAppSingleInstanceBackend(
  out: EntityConstruction<HostAppSingleInstanceProvider>,
  app: ElectronApi['app'],
): void {
  out.hasSingleInstanceLock = () => app.hasSingleInstanceLock();
  out.releaseSingleInstanceLock = () => app.releaseSingleInstanceLock();
  out.requestSingleInstanceLock = () => app.requestSingleInstanceLock();
}

export function initializeAppUserModelIdBackend(
  out: EntityConstruction<HostAppUserModelIdProvider>,
  app: ElectronApi['app'],
): void {
  out.setUserModelId = (id: string) => app.setAppUserModelId(id);
}

export function initializeAppVersionBackend(
  out: EntityConstruction<HostAppVersionProvider>,
  app: ElectronApi['app'],
): void {
  out.getVersion = () => app.getVersion();
}

export function initializeAppVisibilityQueryBackend(
  out: EntityConstruction<HostAppVisibilityQueryProvider>,
  app: ElectronApi['app'],
): void {
  out.isAppHidden = () => app.isHidden();
}

export function initializeElectronCommonAppCapabilities(
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

export function initializeElectronLinuxAppCapabilities(
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

export function initializeElectronMacosAppCapabilities(
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

export function initializeElectronWindowsAppCapabilities(
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

function createElectronLoginItemBackend(electron: ElectronApi) {
  const out = allocateEntity<HostAppLoginItemProvider>();
  initializeAppLoginItemBackend(out, electron);
  return finishEntity(out);
}

function createElectronRecentDocumentsBackend(electron: ElectronApi) {
  const out = allocateEntity<HostAppRecentDocumentsProvider>();
  initializeAppRecentDocumentsBackend(out, electron);
  return finishEntity(out);
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
}
