import type { HostWgpuCapability } from './WgpuHost.ts';

export interface HostWgpuCapabilities {
  readonly context?: HostWgpuCapability;
}
