import type { Entity } from './Entity.ts';

export interface WgpuDeviceState extends Entity {
  readonly device: GPUDevice;
}
