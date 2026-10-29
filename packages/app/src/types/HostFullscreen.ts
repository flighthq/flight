import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';

export type FullscreenTargetHandle = EntityRaw & {
  readonly [EntityRuntimeKey]: EntityRuntime | undefined;
  readonly __brand: 'FullscreenTargetHandle';
};

export interface HostElementFullscreenCapability {
  exit(): Promise<boolean>;
  request(target: FullscreenTargetHandle): Promise<boolean>;
  subscribe?(callback: (fullscreen: boolean) => void): () => void;
}
