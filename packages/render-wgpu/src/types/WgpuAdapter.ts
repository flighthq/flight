import type { WgpuDevice, WgpuDeviceDescriptor, WgpuSupportedFeatures, WgpuSupportedLimits } from './WgpuDevice.ts';

export interface WgpuAdapter {
  readonly features: WgpuSupportedFeatures;
  readonly limits: WgpuSupportedLimits;
  requestDevice(descriptor?: Readonly<WgpuDeviceDescriptor>): Promise<WgpuDevice>;
}

export type WgpuPowerPreference = 'high-performance' | 'low-power';

export interface WgpuRequestAdapterOptions {
  featureLevel?: string;
  forceFallbackAdapter?: boolean;
  powerPreference?: WgpuPowerPreference;
  xrCompatible?: boolean;
}
