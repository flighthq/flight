import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

export interface WgpuDeviceState extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly device: GPUDevice;
}
