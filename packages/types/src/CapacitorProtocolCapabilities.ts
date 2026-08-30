import type { Entity } from './Entity';
import type { HostProtocolCapabilities } from './Host';

export type CapacitorProtocolCapabilities = Entity & Required<Pick<HostProtocolCapabilities, 'open'>>;
