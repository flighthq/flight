import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export interface TilemapSignals extends Entity {
  onCleared: Signal<void>;
  onTileChanged: Signal<readonly [column: number, row: number, id: number]>;
  onTilesChanged: Signal<readonly [offsetColumn: number, offsetRow: number, width: number, height: number]>;
}
