import type {
  HostAppActivateCapability,
  HostAppHideCapability,
  HostAppNameCapability,
  HostAppQuitCapability,
  HostAppVersionCapability,
  CapacitorApi,
  CapacitorAndroidAppCapabilities,
  CapacitorAppCapabilitiesFor,
  CapacitorCommonAppCapabilities,
  CapacitorPluginListenerHandle,
  MobileOsProfile,
} from '@flighthq/types/contract';

export function capacitorHostApp<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorAppCapabilitiesFor<Profile>;
export function capacitorHostApp(capacitor: CapacitorApi, profile: 'android'): CapacitorAndroidAppCapabilities;
export function capacitorHostApp(capacitor: CapacitorApi, profile: 'ios'): CapacitorCommonAppCapabilities;
export function capacitorHostApp(
  capacitor: CapacitorApi,
  profile: MobileOsProfile,
): CapacitorAndroidAppCapabilities | CapacitorCommonAppCapabilities;
export function capacitorHostApp(
  capacitor: CapacitorApi,
  profile: MobileOsProfile,
): CapacitorAndroidAppCapabilities | CapacitorCommonAppCapabilities {
  const common = createCapacitorCommonApp(capacitor);
  if (profile === 'ios') return common;
  return createCapacitorAndroidApp(common, capacitor);
}

export function capacitorHostAppActivate(capacitor: CapacitorApi): HostAppActivateCapability {
  return capacitorHostApp(capacitor, 'ios').activate;
}

export function capacitorHostAppHide(capacitor: CapacitorApi): HostAppHideCapability {
  return capacitorHostApp(capacitor, 'android').hide;
}

export function capacitorHostAppName(capacitor: CapacitorApi): HostAppNameCapability {
  return capacitorHostApp(capacitor, 'ios').name;
}

export function capacitorHostAppQuit(capacitor: CapacitorApi): HostAppQuitCapability {
  return capacitorHostApp(capacitor, 'android').quit;
}

export function capacitorHostAppVersion(capacitor: CapacitorApi): HostAppVersionCapability {
  return capacitorHostApp(capacitor, 'ios').version;
}

function createCapacitorAndroidApp(
  common: CapacitorCommonAppCapabilities,
  capacitor: CapacitorApi,
): CapacitorAndroidAppCapabilities {
  const h = {} as HostAppHideCapability;
  h.hideApp = () => void capacitor.app.minimizeApp().catch(() => {});
  const q = {} as HostAppQuitCapability;
  q.quit = () => void capacitor.app.exitApp().catch(() => {});
  return Object.freeze({
    activate: common.activate,
    hide: h,
    name: common.name,
    quit: q,
    version: common.version,
  });
}

function createCapacitorCommonApp(capacitor: CapacitorApi): CapacitorCommonAppCapabilities {
  let name = '';
  let version = '';
  void capacitor.app
    .getInfo()
    .then((info) => {
      name = info.name;
      version = info.version;
    })
    .catch(() => {});
  const a = {} as HostAppActivateCapability;
  a.subscribe = (listener: () => void) =>
    toCapacitorUnsubscribe(
      capacitor.app.addListener('appStateChange', (state) => {
        if (state.isActive) listener();
      }),
    );
  const n = {} as HostAppNameCapability;
  n.getName = () => name;
  const v = {} as HostAppVersionCapability;
  v.getVersion = () => version;
  return Object.freeze({ activate: a, name: n, version: v });
}

function toCapacitorUnsubscribe(handlePromise: Promise<CapacitorPluginListenerHandle>): () => void {
  let removed = false;
  let handle: CapacitorPluginListenerHandle | null = null;
  void handlePromise
    .then((resolved) => {
      handle = resolved;
      if (removed) void handle.remove().catch(() => {});
    })
    .catch(() => {});
  return () => {
    removed = true;
    if (handle !== null) void handle.remove().catch(() => {});
  };
}
