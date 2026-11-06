import type { HostProtocolCapabilities } from '@flighthq/host/contract';

export type ElectronProtocolCapabilities = Required<
  Pick<HostProtocolCapabilities, 'default' | 'open' | 'registration' | 'registrationQuery' | 'unregistration'>
>;
