import type { MobileOsProfile } from '@flighthq/app/contract';
import type { HostAppCapabilities } from '@flighthq/app/contract';

export type CapacitorCommonAppCapabilities = Required<Pick<HostAppCapabilities, 'activate' | 'name' | 'version'>>;
export type CapacitorAndroidAppCapabilities = CapacitorCommonAppCapabilities &
  Required<Pick<HostAppCapabilities, 'hide' | 'quit'>>;

export type CapacitorAppCapabilitiesFor<Profile extends MobileOsProfile> = Profile extends 'android'
  ? CapacitorAndroidAppCapabilities
  : CapacitorCommonAppCapabilities;
