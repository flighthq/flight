import type { HostProtocolCapabilities } from './Host';

export type ElectronProtocolCapabilities = Required<
  Pick<HostProtocolCapabilities, 'default' | 'open' | 'registration' | 'registrationQuery' | 'unregistration'>
>;
