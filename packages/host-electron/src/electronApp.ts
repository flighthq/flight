import { createEntity } from '@flighthq/entity/contract';
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
  const common: ElectronCommonAppCapabilities = createEntity({
    allWindowsClosed: createEntity({ subscribe: (listener: () => void) => subscribe('window-all-closed', listener) }),
    focus: createEntity({ focus: () => app.focus() }),
    locale: createEntity({
      getLocale: () => app.getLocale(),
      getPreferredSystemLanguages: () => app.getPreferredSystemLanguages(),
      getSystemLocale: () => app.getSystemLocale(),
    }),
    name: createEntity({ getName: () => app.getName() }),
    nameWrite: createEntity({ setName: (name: string) => app.setName(name) }),
    path: createEntity({
      getAppDirectoryPath: (kind: AppPathKind) => app.getPath(toElectronPathName(kind)),
      getAppPath: () => app.getAppPath(),
      getExecutablePath: () => app.getPath('exe'),
    }),
    quit: createEntity({ quit: () => app.quit() }),
    quitRequest: createEntity({
      subscribe: (listener: (cancelHost: () => void) => void) => {
        return subscribe('before-quit', (...args: unknown[]) => {
          const event = args[0] as { preventDefault?: () => void } | undefined;
          listener(() => event?.preventDefault?.());
        });
      },
    }),
    ready: createEntity({ subscribe: (listener: () => void) => subscribe('ready', listener) }),
    relaunch: createEntity({ relaunch: () => app.relaunch() }),
    secondInstance: createEntity({
      subscribe: (listener: (argv: readonly string[]) => void) => {
        return subscribe('second-instance', (...args: unknown[]) => listener((args[1] as string[]) ?? []));
      },
    }),
    singleInstance: createEntity({
      hasSingleInstanceLock: () => app.hasSingleInstanceLock(),
      releaseSingleInstanceLock: () => app.releaseSingleInstanceLock(),
      requestSingleInstanceLock: () => app.requestSingleInstanceLock(),
    }),
    version: createEntity({ getVersion: () => app.getVersion() }),
  });

  if (profile === 'macos') {
    const dock = app.dock;
    if (dock === undefined) throw new Error('Electron macOS app capabilities require app.dock');
    return createEntity({
      ...common,
      activate: createEntity({ subscribe: (listener: () => void) => subscribe('activate', listener) }),
      activationPolicy: createEntity({
        setActivationPolicy: (policy: 'accessory' | 'prohibited' | 'regular') => app.setActivationPolicy(policy),
      }),
      badge: createEntity({ setBadgeCount: async (count: number) => app.setBadgeCount(count) }),
      dock: createEntity({
        bounceDock: () => dock.bounce(),
        cancelAttention: (id: number) => dock.cancelBounce(id),
        cancelDockBounce: (id: number) => dock.cancelBounce(id),
        requestAttention: (critical: boolean) => dock.bounce(critical ? 'critical' : 'informational'),
        setDockBadge: (text: string) => dock.setBadge(text),
        setDockMenu: (items: readonly MenuItemTemplate[]) =>
          dock.setMenu(electron.Menu.buildFromTemplate(toElectronTemplate(items))),
      }),
      loginItem: createElectronLoginItemBackend(electron),
      openFile: createEntity({
        subscribe: (listener: (path: string) => void) => {
          return subscribe('open-file', (...args: unknown[]) => listener(String(args[1] ?? '')));
        },
      }),
      hiddenQuery: createEntity({ isAppHidden: () => app.isHidden() }),
      hide: createEntity({ hideApp: () => app.hide() }),
      recentDocuments: createElectronRecentDocumentsBackend(electron),
      show: createEntity({ showApp: () => app.show() }),
    });
  }

  if (profile === 'windows') {
    return createEntity({
      ...common,
      loginItem: createElectronLoginItemBackend(electron),
      recentDocuments: createElectronRecentDocumentsBackend(electron),
      userModelId: createEntity({ setUserModelId: (id: string) => app.setAppUserModelId(id) }),
    });
  }

  return createEntity({
    ...common,
    badge: createEntity({ setBadgeCount: async (count: number) => app.setBadgeCount(count) }),
  });
}

function createElectronLoginItemBackend(electron: ElectronApi) {
  return createEntity({
    getLoginItem() {
      const settings = electron.app.getLoginItemSettings();
      return {
        args: [],
        openAsHidden: settings.openAsHidden,
        openAtLogin: settings.openAtLogin,
        path: '',
      } satisfies AppLoginItem;
    },
    setLoginItem(settings: Parameters<NonNullable<HostAppCapabilities['loginItem']>['setLoginItem']>[0]) {
      electron.app.setLoginItemSettings({
        args: settings.args ? [...settings.args] : undefined,
        openAsHidden: settings.openAsHidden,
        openAtLogin: settings.openAtLogin,
        path: settings.path,
      });
    },
  });
}

function createElectronRecentDocumentsBackend(electron: ElectronApi) {
  return createEntity({
    addRecentDocument: (path: string) => electron.app.addRecentDocument(path),
    clearRecentDocuments: () => electron.app.clearRecentDocuments(),
  });
}

function toElectronPathName(kind: AppPathKind): string {
  if (kind === 'logs') return 'logs';
  if (kind === 'crashDumps') return 'crashDumps';
  return 'userData';
}
