import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { EntityRaw, EntityRuntime, EntityWithoutRuntime } from '@flighthq/entity/contract';

export interface Rectangle extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  height: number;
  width: number;
  x: number;
  y: number;
}

export type RectangleLike = EntityWithoutRuntime<Rectangle>;

export interface Vector2 extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  x: number;
  y: number;
}

export type Vector2Like = EntityWithoutRuntime<Vector2>;
