export {
  clearTilemap,
  cloneTilemap,
  computeTilemapLocalBoundsRectangle,
  createTilemap,
  enableTilemapSignals,
  fillTilemapTiles,
  getTilemapColumnAtX,
  getTilemapColumnRowAtPoint,
  getTilemapRowAtY,
  getTilemapSignals,
  getTilemapTile,
  getTilemapTileAtPoint,
  getTilemapTileAtPointXY,
  getTilemapTileRect,
  resizeTilemap,
  setTilemapTile,
  setTilemapTiles,
  setTilemapTileTint,
} from './tilemap.ts';
export type { Tilemap, TilemapData, TilemapRuntime, TilemapSignals } from './types.ts';
export { TilemapKind } from './types.ts';
