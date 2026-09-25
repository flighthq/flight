import type { HostProtocolCapabilities } from './Host.ts';

export type ElectronProtocolCapabilities = Required<
  Pick<HostProtocolCapabilities, 'default' | 'open' | 'registration' | 'registrationQuery' | 'unregistration'>
>;
