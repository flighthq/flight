import type { HostProtocolCapabilities } from '@flighthq/host/contract';

export type CapacitorProtocolCapabilities = Required<Pick<HostProtocolCapabilities, 'open'>>;
