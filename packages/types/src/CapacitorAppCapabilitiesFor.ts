import type { MobileOsProfile } from './App.ts';
import type { HostAppCapabilities } from './Host.ts';

export type CapacitorCommonAppCapabilities = Required<Pick<HostAppCapabilities, 'activate' | 'name' | 'version'>>;
export type CapacitorAndroidAppCapabilities = CapacitorCommonAppCapabilities &
  Required<Pick<HostAppCapabilities, 'hide' | 'quit'>>;

export type CapacitorAppCapabilitiesFor<Profile extends MobileOsProfile> = Profile extends 'android'
  ? CapacitorAndroidAppCapabilities
  : CapacitorCommonAppCapabilities;
