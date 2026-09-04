import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppActivateBackend,
  AppActivationPolicyBackend,
  AppAllWindowsClosedBackend,
  AppBadgeBackend,
  AppDockBackend,
  AppFocusBackend,
  AppLocaleBackend,
  AppLoginItem,
  AppLoginItemBackend,
  AppNameBackend,
  AppNameWriteBackend,
  AppOpenFileBackend,
  AppPathBackend,
  AppPathKind,
  AppQuitBackend,
  AppQuitRequestBackend,
  AppReadyBackend,
  AppRecentDocumentsBackend,
  AppRelaunchBackend,
  AppSecondInstanceBackend,
  AppShowBackend,
  AppSingleInstanceBackend,
  AppUserModelIdBackend,
  AppVersionBackend,
  AppVisibilityQueryBackend,
  DesktopOsProfile,
  ElectronApi,
  ElectronAppCapabilitiesFor,
  ElectronCommonAppCapabilities,
  ElectronLinuxAppCapabilities,
  ElectronMacosAppCapabilities,
  ElectronWindowsAppCapabilities,
  EntityConstruction,
  AppHideBackend,
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
      const b = allocateEntity<AppAllWindowsClosedBackend>();
      initializeAppAllWindowsClosedBackend(b, subscribe);
      return finishEntity(b);
    })();
    const focus = (() => {
      const b = allocateEntity<AppFocusBackend>();
      initializeAppFocusBackend(b, app);
      return finishEntity(b);
    })();
    const locale = (() => {
      const b = allocateEntity<AppLocaleBackend>();
      initializeAppLocaleBackend(b, app);
      return finishEntity(b);
    })();
    const name = (() => {
      const b = allocateEntity<AppNameBackend>();
      initializeAppNameBackend(b, app);
      return finishEntity(b);
    })();
    const nameWrite = (() => {
      const b = allocateEntity<AppNameWriteBackend>();
      initializeAppNameWriteBackend(b, app);
      return finishEntity(b);
    })();
    const path = (() => {
      const b = allocateEntity<AppPathBackend>();
      initializeAppPathBackend(b, app);
      return finishEntity(b);
    })();
    const quit = (() => {
      const b = allocateEntity<AppQuitBackend>();
      initializeAppQuitBackend(b, app);
      return finishEntity(b);
    })();
    const quitRequest = (() => {
      const b = allocateEntity<AppQuitRequestBackend>();
      initializeAppQuitRequestBackend(b, subscribe);
      return finishEntity(b);
    })();
    const ready = (() => {
      const b = allocateEntity<AppReadyBackend>();
      initializeAppReadyBackend(b, subscribe);
      return finishEntity(b);
    })();
    const relaunch = (() => {
      const b = allocateEntity<AppRelaunchBackend>();
      initializeAppRelaunchBackend(b, app);
      return finishEntity(b);
    })();
    const secondInstance = (() => {
      const b = allocateEntity<AppSecondInstanceBackend>();
      initializeAppSecondInstanceBackend(b, subscribe);
      return finishEntity(b);
    })();
    const singleInstance = (() => {
      const b = allocateEntity<AppSingleInstanceBackend>();
      initializeAppSingleInstanceBackend(b, app);
      return finishEntity(b);
    })();
    const version = (() => {
      const b = allocateEntity<AppVersionBackend>();
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
      const b = allocateEntity<AppActivateBackend>();
      initializeAppActivateBackend(b, subscribe);
      return finishEntity(b);
    })();
    const activationPolicy = (() => {
      const b = allocateEntity<AppActivationPolicyBackend>();
      initializeAppActivationPolicyBackend(b, app);
      return finishEntity(b);
    })();
    const badge = (() => {
      const b = allocateEntity<AppBadgeBackend>();
      initializeAppBadgeBackend(b, app);
      return finishEntity(b);
    })();
    const dockBackend = (() => {
      const b = allocateEntity<AppDockBackend>();
      initializeAppDockBackend(b, dock, electron);
      return finishEntity(b);
    })();
    const hide = (() => {
      const b = allocateEntity<AppHideBackend>();
      initializeAppHideBackend(b, app);
      return finishEntity(b);
    })();
    const hiddenQuery = (() => {
      const b = allocateEntity<AppVisibilityQueryBackend>();
      initializeAppVisibilityQueryBackend(b, app);
      return finishEntity(b);
    })();
    const loginItem = createElectronLoginItemBackend(electron);
    const openFile = (() => {
      const b = allocateEntity<AppOpenFileBackend>();
      initializeAppOpenFileBackend(b, subscribe);
      return finishEntity(b);
    })();
    const recentDocuments = createElectronRecentDocumentsBackend(electron);
    const show = (() => {
      const b = allocateEntity<AppShowBackend>();
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
      const b = allocateEntity<AppUserModelIdBackend>();
      initializeAppUserModelIdBackend(b, app);
      return finishEntity(b);
    })();
    initializeElectronWindowsAppCapabilities(win, common, loginItem, recentDocuments, userModelId);
    return finishEntity(win);
  }

  const linux = allocateEntity<ElectronLinuxAppCapabilities>();
  const badge = (() => {
    const b = allocateEntity<AppBadgeBackend>();
    initializeAppBadgeBackend(b, app);
    return finishEntity(b);
  })();
  initializeElectronLinuxAppCapabilities(linux, common, badge);
  return finishEntity(linux);
}

export function initializeAppActivateBackend(
  out: EntityConstruction<AppActivateBackend>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('activate', listener);
}

export function initializeAppActivationPolicyBackend(
  out: EntityConstruction<AppActivationPolicyBackend>,
  app: ElectronApi['app'],
): void {
  out.setActivationPolicy = (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy);
}

export function initializeAppAllWindowsClosedBackend(
  out: EntityConstruction<AppAllWindowsClosedBackend>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('window-all-closed', listener);
}

export function initializeAppBadgeBackend(out: EntityConstruction<AppBadgeBackend>, app: ElectronApi['app']): void {
  out.setBadgeCount = async (count: number) => app.setBadgeCount(count);
}

export function initializeAppDockBackend(
  out: EntityConstruction<AppDockBackend>,
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

export function initializeAppFocusBackend(out: EntityConstruction<AppFocusBackend>, app: ElectronApi['app']): void {
  out.focus = () => app.focus();
}

export function initializeAppHideBackend(out: EntityConstruction<AppHideBackend>, app: ElectronApi['app']): void {
  out.hideApp = () => app.hide();
}

export function initializeAppLocaleBackend(out: EntityConstruction<AppLocaleBackend>, app: ElectronApi['app']): void {
  out.getLocale = () => app.getLocale();
  out.getPreferredSystemLanguages = () => app.getPreferredSystemLanguages();
  out.getSystemLocale = () => app.getSystemLocale();
}

export function initializeAppLoginItemBackend(
  out: EntityConstruction<AppLoginItemBackend>,
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

export function initializeAppNameBackend(out: EntityConstruction<AppNameBackend>, app: ElectronApi['app']): void {
  out.getName = () => app.getName();
}

export function initializeAppNameWriteBackend(
  out: EntityConstruction<AppNameWriteBackend>,
  app: ElectronApi['app'],
): void {
  out.setName = (name: string) => app.setName(name);
}

export function initializeAppOpenFileBackend(
  out: EntityConstruction<AppOpenFileBackend>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (path: string) => void) => {
    return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
  };
}

export function initializeAppPathBackend(out: EntityConstruction<AppPathBackend>, app: ElectronApi['app']): void {
  out.getAppDirectoryPath = (kind: AppPathKind) => app.getPath(toElectronPathName(kind));
  out.getAppPath = () => app.getAppPath();
  out.getExecutablePath = () => app.getPath('exe');
}

export function initializeAppQuitBackend(out: EntityConstruction<AppQuitBackend>, app: ElectronApi['app']): void {
  out.quit = () => app.quit();
}

export function initializeAppQuitRequestBackend(
  out: EntityConstruction<AppQuitRequestBackend>,
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
  out: EntityConstruction<AppReadyBackend>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: () => void) => subscribe('ready', listener);
}

export function initializeAppRecentDocumentsBackend(
  out: EntityConstruction<AppRecentDocumentsBackend>,
  electron: ElectronApi,
): void {
  out.addRecentDocument = (path: string) => electron.app.addRecentDocument(path);
  out.clearRecentDocuments = () => electron.app.clearRecentDocuments();
}

export function initializeAppRelaunchBackend(
  out: EntityConstruction<AppRelaunchBackend>,
  app: ElectronApi['app'],
): void {
  out.relaunch = () => app.relaunch();
}

export function initializeAppSecondInstanceBackend(
  out: EntityConstruction<AppSecondInstanceBackend>,
  subscribe: (event: string, listener: (...args: unknown[]) => void) => () => void,
): void {
  out.subscribe = (listener: (argv: readonly string[]) => void) => {
    return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
  };
}

export function initializeAppShowBackend(out: EntityConstruction<AppShowBackend>, app: ElectronApi['app']): void {
  out.showApp = () => app.show();
}

export function initializeAppSingleInstanceBackend(
  out: EntityConstruction<AppSingleInstanceBackend>,
  app: ElectronApi['app'],
): void {
  out.hasSingleInstanceLock = () => app.hasSingleInstanceLock();
  out.releaseSingleInstanceLock = () => app.releaseSingleInstanceLock();
  out.requestSingleInstanceLock = () => app.requestSingleInstanceLock();
}

export function initializeAppUserModelIdBackend(
  out: EntityConstruction<AppUserModelIdBackend>,
  app: ElectronApi['app'],
): void {
  out.setUserModelId = (id: string) => app.setAppUserModelId(id);
}

export function initializeAppVersionBackend(out: EntityConstruction<AppVersionBackend>, app: ElectronApi['app']): void {
  out.getVersion = () => app.getVersion();
}

export function initializeAppVisibilityQueryBackend(
  out: EntityConstruction<AppVisibilityQueryBackend>,
  app: ElectronApi['app'],
): void {
  out.isAppHidden = () => app.isHidden();
}

export function initializeElectronCommonAppCapabilities(
  out: EntityConstruction<ElectronCommonAppCapabilities>,
  allWindowsClosed: AppAllWindowsClosedBackend,
  focus: AppFocusBackend,
  locale: AppLocaleBackend,
  name: AppNameBackend,
  nameWrite: AppNameWriteBackend,
  path: AppPathBackend,
  quit: AppQuitBackend,
  quitRequest: AppQuitRequestBackend,
  ready: AppReadyBackend,
  relaunch: AppRelaunchBackend,
  secondInstance: AppSecondInstanceBackend,
  singleInstance: AppSingleInstanceBackend,
  version: AppVersionBackend,
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
  badge: AppBadgeBackend,
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
  activate: AppActivateBackend,
  activationPolicy: AppActivationPolicyBackend,
  badge: AppBadgeBackend,
  dock: AppDockBackend,
  hide: AppHideBackend,
  hiddenQuery: AppVisibilityQueryBackend,
  loginItem: AppLoginItemBackend,
  openFile: AppOpenFileBackend,
  recentDocuments: AppRecentDocumentsBackend,
  show: AppShowBackend,
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
  loginItem: AppLoginItemBackend,
  recentDocuments: AppRecentDocumentsBackend,
  userModelId: AppUserModelIdBackend,
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
  const out = allocateEntity<AppLoginItemBackend>();
  initializeAppLoginItemBackend(out, electron);
  return finishEntity(out);
}

function createElectronRecentDocumentsBackend(electron: ElectronApi) {
  const out = allocateEntity<AppRecentDocumentsBackend>();
  initializeAppRecentDocumentsBackend(out, electron);
  return finishEntity(out);
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
}
