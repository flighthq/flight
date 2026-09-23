import type { HostProtocolCapabilities } from './Host';

export type CapacitorProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'open'>>;
