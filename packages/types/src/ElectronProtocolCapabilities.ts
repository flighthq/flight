import type { Entity } from './Entity';
import type { HostProtocolCapabilities } from './Host';

export type ElectronProtocolCapabilities = Entity &
  Required<
    Pick<HostProtocolCapabilities, 'default' | 'open' | 'registration' | 'registrationQuery' | 'unregistration'>
  >;
