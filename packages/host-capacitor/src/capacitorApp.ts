import { createEntity } from '@flighthq/entity/contract';
import type {
  CapacitorApi,
  CapacitorPluginListenerHandle,
  Entity,
  HostAppCapabilities,
  MobileOsProfile,
} from '@flighthq/types/contract';

type CapacitorCommonAppCapabilities = Entity & Required<Pick<HostAppCapabilities, 'activate' | 'name' | 'version'>>;
type CapacitorAndroidAppCapabilities = CapacitorCommonAppCapabilities &
  Required<Pick<HostAppCapabilities, 'hide' | 'quit'>>;

export type CapacitorAppCapabilitiesFor<Profile extends MobileOsProfile> = Profile extends 'android'
  ? CapacitorAndroidAppCapabilities
  : CapacitorCommonAppCapabilities;

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
  const common: CapacitorCommonAppCapabilities = createEntity({
    activate: createEntity({
      subscribe: (listener: () => void) =>
        toCapacitorUnsubscribe(
          capacitor.app.addListener('appStateChange', (state) => {
            if (state.isActive) listener();
          }),
        ),
    }),
    name: createEntity({ getName: () => name }),
    version: createEntity({ getVersion: () => version }),
  });
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
