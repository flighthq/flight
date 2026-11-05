import type { Entity } from '@flighthq/types/contract';

export interface WgpuDeviceState extends Entity {
  readonly device: GPUDevice;
}
