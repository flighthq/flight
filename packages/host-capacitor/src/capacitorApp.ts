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
  let name = '';
  let version = '';
  void capacitor.app
    .getInfo()
    .then((info) => {
      name = info.name;
      version = info.version;
    })
    .catch(() => {});
  const common = (() => {
    const out = allocateEntity<CapacitorCommonAppCapabilities>();
    out.activate = (() => {
      const a = allocateEntity<AppActivateBackend>();
      a.subscribe = (listener: () => void) =>
        toCapacitorUnsubscribe(
          capacitor.app.addListener('appStateChange', (state) => {
            if (state.isActive) listener();
          }),
        );
      return finishEntity(a);
    })();
    out.name = (() => {
      const n = allocateEntity<AppNameBackend>();
      n.getName = () => name;
      return finishEntity(n);
    })();
    out.version = (() => {
      const v = allocateEntity<AppVersionBackend>();
      v.getVersion = () => version;
      return finishEntity(v);
    })();
    return finishEntity(out);
  })();
  if (profile === 'ios') return common;
  const android = allocateEntity<CapacitorAndroidAppCapabilities>();
  android.activate = common.activate;
  android.name = common.name;
  android.version = common.version;
  android.hide = (() => {
    const h = allocateEntity<AppHideBackend>();
    h.hideApp = () => void capacitor.app.minimizeApp().catch(() => {});
    return finishEntity(h);
  })();
  android.quit = (() => {
    const q = allocateEntity<AppQuitBackend>();
    q.quit = () => void capacitor.app.exitApp().catch(() => {});
    return finishEntity(q);
  })();
  return finishEntity(android);
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
