import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';

export interface TilemapSignals extends Entity {
  onCleared: Signal<void>;
  onTileChanged: Signal<readonly [column: number, row: number, id: number]>;
  onTilesChanged: Signal<readonly [offsetColumn: number, offsetRow: number, width: number, height: number]>;
}
