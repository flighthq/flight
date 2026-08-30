import type { Entity } from './Entity';
import type { HostAppCapabilities } from './Host';
import type { DesktopOsProfile } from './Tray';

export type ElectronCommonAppCapabilities = Entity &
  Required<
    Pick<
      HostAppCapabilities,
      | 'allWindowsClosed'
      | 'focus'
      | 'locale'
      | 'name'
      | 'nameWrite'
      | 'path'
      | 'quit'
      | 'quitRequest'
      | 'ready'
      | 'relaunch'
      | 'secondInstance'
      | 'singleInstance'
      | 'version'
    >
  >;
export type ElectronMacosAppCapabilities = ElectronCommonAppCapabilities &
  Required<
    Pick<
      HostAppCapabilities,
      | 'activate'
      | 'activationPolicy'
      | 'badge'
      | 'dock'
      | 'hiddenQuery'
      | 'hide'
      | 'loginItem'
      | 'openFile'
      | 'recentDocuments'
      | 'show'
    >
  >;
export type ElectronLinuxAppCapabilities = ElectronCommonAppCapabilities & Required<Pick<HostAppCapabilities, 'badge'>>;
export type ElectronWindowsAppCapabilities = ElectronCommonAppCapabilities &
  Required<Pick<HostAppCapabilities, 'loginItem' | 'recentDocuments' | 'userModelId'>>;

export type ElectronAppCapabilitiesFor<Profile extends DesktopOsProfile> = Profile extends 'macos'
  ? ElectronMacosAppCapabilities
  : Profile extends 'windows'
    ? ElectronWindowsAppCapabilities
    : ElectronLinuxAppCapabilities;
