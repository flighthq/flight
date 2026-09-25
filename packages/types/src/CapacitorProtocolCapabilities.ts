import type { HostProtocolCapabilities } from './Host.ts';

export type CapacitorProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'open'>>;
