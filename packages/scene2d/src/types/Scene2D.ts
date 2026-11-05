import type { EntityRuntime } from '@flighthq/entity/contract';
import type { ViewportAlign } from '@flighthq/layout/contract';
import type { ViewportScaleMode } from '@flighthq/node/contract';

import type { Node2D } from './Node2D.ts';
import type { Scene2DEntity } from './Scene2DEntity.ts';
import type { Scene2DSignals } from './Scene2DSignals.ts';
export interface Scene2D extends Scene2DEntity {
  align: ViewportAlign;
  color: number | null;
  root: Node2D;
  scaleMode: ViewportScaleMode;
  scene2dHeight: number;
  scene2dWidth: number;
}
export interface Scene2DRuntime extends EntityRuntime {
  scene2dSignals: Scene2DSignals | null;
}
