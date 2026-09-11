import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  HostAppActivateProvider,
  HostAppHideProvider,
  HostAppNameProvider,
  HostAppQuitProvider,
  HostAppVersionProvider,
  CapacitorApi,
  CapacitorAndroidAppCapabilities,
  CapacitorAppCapabilitiesFor,
  CapacitorCommonAppCapabilities,
  CapacitorPluginListenerHandle,
  EntityConstruction,
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
  const common = allocateEntity<CapacitorCommonAppCapabilities>();
  populateCapacitorCommonApp(common, capacitor);
  const finished = finishEntity(common);
  if (profile === 'ios') return finished;
  const android = allocateEntity<CapacitorAndroidAppCapabilities>();
  populateCapacitorAndroidApp(android, finished, capacitor);
  return finishEntity(android);
}

export function capacitorHostAppActivate(capacitor: CapacitorApi): HostAppActivateProvider {
  return capacitorHostApp(capacitor, 'ios').activate;
}

export function capacitorHostAppHide(capacitor: CapacitorApi): HostAppHideProvider {
  return capacitorHostApp(capacitor, 'android').hide;
}

export function capacitorHostAppName(capacitor: CapacitorApi): HostAppNameProvider {
  return capacitorHostApp(capacitor, 'ios').name;
}

export function capacitorHostAppQuit(capacitor: CapacitorApi): HostAppQuitProvider {
  return capacitorHostApp(capacitor, 'android').quit;
}

export function capacitorHostAppVersion(capacitor: CapacitorApi): HostAppVersionProvider {
  return capacitorHostApp(capacitor, 'ios').version;
}

function populateCapacitorAndroidApp(
  out: EntityConstruction<CapacitorAndroidAppCapabilities>,
  common: CapacitorCommonAppCapabilities,
  capacitor: CapacitorApi,
): void {
  out.activate = common.activate;
  const h = allocateEntity<HostAppHideProvider>();
  h.hideApp = () => void capacitor.app.minimizeApp().catch(() => {});
  out.hide = finishEntity(h);
  out.name = common.name;
  const q = allocateEntity<HostAppQuitProvider>();
  q.quit = () => void capacitor.app.exitApp().catch(() => {});
  out.quit = finishEntity(q);
  out.version = common.version;
}

function populateCapacitorCommonApp(
  out: EntityConstruction<CapacitorCommonAppCapabilities>,
  capacitor: CapacitorApi,
): void {
  let name = '';
  let version = '';
  void capacitor.app
    .getInfo()
    .then((info) => {
      name = info.name;
      version = info.version;
    })
    .catch(() => {});
  const a = allocateEntity<HostAppActivateProvider>();
  a.subscribe = (listener: () => void) =>
    toCapacitorUnsubscribe(
      capacitor.app.addListener('appStateChange', (state) => {
        if (state.isActive) listener();
      }),
    );
  out.activate = finishEntity(a);
  const n = allocateEntity<HostAppNameProvider>();
  n.getName = () => name;
  out.name = finishEntity(n);
  const v = allocateEntity<HostAppVersionProvider>();
  v.getVersion = () => version;
  out.version = finishEntity(v);
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
