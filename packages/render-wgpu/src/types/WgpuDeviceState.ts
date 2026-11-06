import type { Entity } from '@flighthq/entity/contract';

export interface WgpuDeviceState extends Entity {
  readonly device: GPUDevice;
}
