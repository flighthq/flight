import type { EntityRaw, EntityRuntime, EntityRuntimeKey } from '@flighthq/entity/contract';

import type { WgpuDevice } from './WgpuDevice.ts';

export interface WgpuDeviceState extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  device: WgpuDevice;
}
