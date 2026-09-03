import type { Entity } from './Entity';
import type { Signal } from './Signal';

export interface TilemapSignals extends Entity {
  onCleared: Signal<() => void>;
  onTileChanged: Signal<(column: number, row: number, id: number) => void>;
  onTilesChanged: Signal<(offsetColumn: number, offsetRow: number, width: number, height: number) => void>;
}
