import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppActivateBackend,
  AppHideBackend,
  AppNameBackend,
  AppQuitBackend,
  AppVersionBackend,
  CapacitorApi,
  CapacitorAndroidAppCapabilities,
  CapacitorAppCapabilitiesFor,
  CapacitorCommonAppCapabilities,
  CapacitorPluginListenerHandle,
  EntityConstruction,
  MobileOsProfile,
} from '@flighthq/types/contract';

export function createCapacitorAppCapabilities<Profile extends MobileOsProfile>(
  capacitor: CapacitorApi,
  profile: Profile,
): CapacitorAppCapabilitiesFor<Profile>;
export function createCapacitorAppCapabilities(
  capacitor: CapacitorApi,
  profile: 'android',
): CapacitorAndroidAppCapabilities;
export function createCapacitorAppCapabilities(capacitor: CapacitorApi, profile: 'ios'): CapacitorCommonAppCapabilities;
export function createCapacitorAppCapabilities(
  capacitor: CapacitorApi,
  profile: MobileOsProfile,
): CapacitorAndroidAppCapabilities | CapacitorCommonAppCapabilities;
export function createCapacitorAppCapabilities(
  capacitor: CapacitorApi,
  profile: MobileOsProfile,
): CapacitorAndroidAppCapabilities | CapacitorCommonAppCapabilities {
  const common = allocateEntity<CapacitorCommonAppCapabilities>();
  initializeCapacitorCommonAppCapabilities(common, capacitor);
  const finished = finishEntity(common);
  if (profile === 'ios') return finished;
  const android = allocateEntity<CapacitorAndroidAppCapabilities>();
  initializeCapacitorAndroidAppCapabilities(android, finished, capacitor);
  return finishEntity(android);
}

export function initializeCapacitorAndroidAppCapabilities(
  out: EntityConstruction<CapacitorAndroidAppCapabilities>,
  common: CapacitorCommonAppCapabilities,
  capacitor: CapacitorApi,
): void {
  out.activate = common.activate;
  const h = allocateEntity<AppHideBackend>();
  h.hideApp = () => void capacitor.app.minimizeApp().catch(() => {});
  out.hide = finishEntity(h);
  out.name = common.name;
  const q = allocateEntity<AppQuitBackend>();
  q.quit = () => void capacitor.app.exitApp().catch(() => {});
  out.quit = finishEntity(q);
  out.version = common.version;
}

export function initializeCapacitorCommonAppCapabilities(
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
  const a = allocateEntity<AppActivateBackend>();
  a.subscribe = (listener: () => void) =>
    toCapacitorUnsubscribe(
      capacitor.app.addListener('appStateChange', (state) => {
        if (state.isActive) listener();
      }),
    );
  out.activate = finishEntity(a);
  const n = allocateEntity<AppNameBackend>();
  n.getName = () => name;
  out.name = finishEntity(n);
  const v = allocateEntity<AppVersionBackend>();
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
