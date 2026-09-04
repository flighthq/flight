import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
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
    out.activate = createEntity({
      subscribe: (listener: () => void) =>
        toCapacitorUnsubscribe(
          capacitor.app.addListener('appStateChange', (state) => {
            if (state.isActive) listener();
          }),
        ),
    });
    out.name = createEntity({ getName: () => name });
    out.version = createEntity({ getVersion: () => version });
    return finishEntity(out);
  })();
  if (profile === 'ios') return common;
  return createEntity({
    ...common,
    hide: createEntity({ hideApp: () => void capacitor.app.minimizeApp().catch(() => {}) }),
    quit: createEntity({ quit: () => void capacitor.app.exitApp().catch(() => {}) }),
  });
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
