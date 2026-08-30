import type { Entity } from './Entity';

export interface WgpuDeviceState extends Entity {
  readonly device: GPUDevice;
}
