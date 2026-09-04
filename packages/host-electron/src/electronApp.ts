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
    out.allWindowsClosed = (() => {
      const b = allocateEntity<AppAllWindowsClosedBackend>();
      b.subscribe = (listener: () => void) => subscribe('window-all-closed', listener);
      return finishEntity(b);
    })();
    out.focus = (() => {
      const b = allocateEntity<AppFocusBackend>();
      b.focus = () => app.focus();
      return finishEntity(b);
    })();
    out.locale = (() => {
      const b = allocateEntity<AppLocaleBackend>();
      b.getLocale = () => app.getLocale();
      b.getPreferredSystemLanguages = () => app.getPreferredSystemLanguages();
      b.getSystemLocale = () => app.getSystemLocale();
      return finishEntity(b);
    })();
    out.name = (() => {
      const b = allocateEntity<AppNameBackend>();
      b.getName = () => app.getName();
      return finishEntity(b);
    })();
    out.nameWrite = (() => {
      const b = allocateEntity<AppNameWriteBackend>();
      b.setName = (name: string) => app.setName(name);
      return finishEntity(b);
    })();
    out.path = (() => {
      const b = allocateEntity<AppPathBackend>();
      b.getAppDirectoryPath = (kind: AppPathKind) => app.getPath(toElectronPathName(kind));
      b.getAppPath = () => app.getAppPath();
      b.getExecutablePath = () => app.getPath('exe');
      return finishEntity(b);
    })();
    out.quit = (() => {
      const b = allocateEntity<AppQuitBackend>();
      b.quit = () => app.quit();
      return finishEntity(b);
    })();
    out.quitRequest = (() => {
      const b = allocateEntity<AppQuitRequestBackend>();
      b.subscribe = (listener: (cancelHost: () => void) => void) => {
        return subscribe('before-quit', (...args: unknown[]) => {
          const event = args[0] as { preventDefault?: () => void } | undefined;
          listener(() => event?.preventDefault?.());
        });
      };
      return finishEntity(b);
    })();
    out.ready = (() => {
      const b = allocateEntity<AppReadyBackend>();
      b.subscribe = (listener: () => void) => subscribe('ready', listener);
      return finishEntity(b);
    })();
    out.relaunch = (() => {
      const b = allocateEntity<AppRelaunchBackend>();
      b.relaunch = () => app.relaunch();
      return finishEntity(b);
    })();
    out.secondInstance = (() => {
      const b = allocateEntity<AppSecondInstanceBackend>();
      b.subscribe = (listener: (argv: readonly string[]) => void) => {
        return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
      };
      return finishEntity(b);
    })();
    out.singleInstance = (() => {
      const b = allocateEntity<AppSingleInstanceBackend>();
      b.hasSingleInstanceLock = () => app.hasSingleInstanceLock();
      b.releaseSingleInstanceLock = () => app.releaseSingleInstanceLock();
      b.requestSingleInstanceLock = () => app.requestSingleInstanceLock();
      return finishEntity(b);
    })();
    out.version = (() => {
      const b = allocateEntity<AppVersionBackend>();
      b.getVersion = () => app.getVersion();
      return finishEntity(b);
    })();
    return finishEntity(out);
  })();

  if (profile === 'macos') {
    const dock = app.dock;
    if (dock === undefined) throw new Error('Electron macOS app capabilities require app.dock');
    const macos = allocateEntity<ElectronMacosAppCapabilities>();
    macos.allWindowsClosed = common.allWindowsClosed;
    macos.focus = common.focus;
    macos.locale = common.locale;
    macos.name = common.name;
    macos.nameWrite = common.nameWrite;
    macos.path = common.path;
    macos.quit = common.quit;
    macos.quitRequest = common.quitRequest;
    macos.ready = common.ready;
    macos.relaunch = common.relaunch;
    macos.secondInstance = common.secondInstance;
    macos.singleInstance = common.singleInstance;
    macos.version = common.version;
    macos.activate = (() => {
      const b = allocateEntity<AppActivateBackend>();
      b.subscribe = (listener: () => void) => subscribe('activate', listener);
      return finishEntity(b);
    })();
    macos.activationPolicy = (() => {
      const b = allocateEntity<AppActivationPolicyBackend>();
      b.setActivationPolicy = (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy);
      return finishEntity(b);
    })();
    macos.badge = (() => {
      const b = allocateEntity<AppBadgeBackend>();
      b.setBadgeCount = async (count: number) => app.setBadgeCount(count);
      return finishEntity(b);
    })();
    macos.dock = (() => {
      const b = allocateEntity<AppDockBackend>();
      b.bounceDock = () => dock.bounce();
      b.cancelAttention = (id: number) => dock.cancelBounce(id);
      b.cancelDockBounce = (id: number) => dock.cancelBounce(id);
      b.requestAttention = (critical: boolean) => dock.bounce(critical ? 'critical' : 'informational');
      b.setDockBadge = (text: string) => dock.setBadge(text);
      b.setDockMenu = (items: readonly MenuItemTemplate[]) =>
        dock.setMenu(electron.Menu.buildFromTemplate(toElectronTemplate(items)));
      return finishEntity(b);
    })();
    macos.loginItem = createElectronLoginItemBackend(electron);
    macos.openFile = (() => {
      const b = allocateEntity<AppOpenFileBackend>();
      b.subscribe = (listener: (path: string) => void) => {
        return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
      };
      return finishEntity(b);
    })();
    macos.hiddenQuery = (() => {
      const b = allocateEntity<AppVisibilityQueryBackend>();
      b.isAppHidden = () => app.isHidden();
      return finishEntity(b);
    })();
    macos.hide = (() => {
      const b = allocateEntity<AppHideBackend>();
      b.hideApp = () => app.hide();
      return finishEntity(b);
    })();
    macos.recentDocuments = createElectronRecentDocumentsBackend(electron);
    macos.show = (() => {
      const b = allocateEntity<AppShowBackend>();
      b.showApp = () => app.show();
      return finishEntity(b);
    })();
    return finishEntity(macos);
  }

  if (profile === 'windows') {
    const win = allocateEntity<ElectronWindowsAppCapabilities>();
    win.allWindowsClosed = common.allWindowsClosed;
    win.focus = common.focus;
    win.locale = common.locale;
    win.name = common.name;
    win.nameWrite = common.nameWrite;
    win.path = common.path;
    win.quit = common.quit;
    win.quitRequest = common.quitRequest;
    win.ready = common.ready;
    win.relaunch = common.relaunch;
    win.secondInstance = common.secondInstance;
    win.singleInstance = common.singleInstance;
    win.version = common.version;
    win.loginItem = createElectronLoginItemBackend(electron);
    win.recentDocuments = createElectronRecentDocumentsBackend(electron);
    win.userModelId = (() => {
      const b = allocateEntity<AppUserModelIdBackend>();
      b.setUserModelId = (id: string) => app.setAppUserModelId(id);
      return finishEntity(b);
    })();
    return finishEntity(win);
  }

  const linux = allocateEntity<ElectronLinuxAppCapabilities>();
  linux.allWindowsClosed = common.allWindowsClosed;
  linux.focus = common.focus;
  linux.locale = common.locale;
  linux.name = common.name;
  linux.nameWrite = common.nameWrite;
  linux.path = common.path;
  linux.quit = common.quit;
  linux.quitRequest = common.quitRequest;
  linux.ready = common.ready;
  linux.relaunch = common.relaunch;
  linux.secondInstance = common.secondInstance;
  linux.singleInstance = common.singleInstance;
  linux.version = common.version;
  linux.badge = (() => {
    const b = allocateEntity<AppBadgeBackend>();
    b.setBadgeCount = async (count: number) => app.setBadgeCount(count);
    return finishEntity(b);
  })();
  return finishEntity(linux);
}

function createElectronLoginItemBackend(electron: ElectronApi) {
  const out = allocateEntity<AppLoginItemBackend>();
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
  return finishEntity(out);
}

function createElectronRecentDocumentsBackend(electron: ElectronApi) {
  const out = allocateEntity<AppRecentDocumentsBackend>();
  out.addRecentDocument = (path: string) => electron.app.addRecentDocument(path);
  out.clearRecentDocuments = () => electron.app.clearRecentDocuments();
  return finishEntity(out);
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
}
