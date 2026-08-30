import type { MobileOsProfile } from './App';
import type { Entity } from './Entity';
import type { HostAppCapabilities } from './Host';

export type CapacitorCommonAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'activate' | 'name' | 'version'>>;
export type CapacitorAndroidAppCapabilities = CapacitorCommonAppCapabilities &
  Required<Pick<HostAppCapabilities, 'hide' | 'quit'>>;

export type CapacitorAppCapabilitiesFor<Profile extends MobileOsProfile> = Profile extends 'android'
  ? CapacitorAndroidAppCapabilities
  : CapacitorCommonAppCapabilities;
