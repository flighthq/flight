import type { MethodsOf, Node, PartialNode, Rectangle, Tilemap, TilemapData, TilemapRuntime } from '@flighthq/types';
import { TilemapKind } from '@flighthq/types';

import { createSpriteNode, createSpriteNodeRuntime, getSpriteNodeRuntime } from './spriteNode';

export function computeTilemapLocalBoundsRectangle(out: Rectangle, source: Readonly<Node>): void {
  const tilemap = source as Tilemap;
  const { tileset, columns, rows } = tilemap.data;
  out.x = 0;
  out.y = 0;
  out.width = tileset !== null ? columns * tileset.tileWidth : 0;
  out.height = tileset !== null ? rows * tileset.tileHeight : 0;
}

export function createTilemap(obj?: Readonly<PartialNode<Tilemap>>): Tilemap {
  return createSpriteNode(TilemapKind, obj, createTilemapData, createTilemapRuntime) as Tilemap;
}

export function createTilemapData(data?: Readonly<Partial<TilemapData>>): TilemapData {
  const columns = data?.columns ?? 0;
  const rows = data?.rows ?? 0;
  return {
    columns,
    rows,
    tiles: data?.tiles ?? new Int16Array(columns * rows).fill(-1),
    tileset: data?.tileset ?? null,
  };
}

export function createTilemapRuntime(): TilemapRuntime {
  return createSpriteNodeRuntime(defaultMethods) as TilemapRuntime;
}

export function fillTilemapTiles(tilemap: Tilemap, id: number): void {
  tilemap.data.tiles.fill(id);
}

export function getTilemapRuntime(source: Readonly<Tilemap>): Readonly<TilemapRuntime> {
  return getSpriteNodeRuntime(source) as TilemapRuntime;
}

export function getTilemapTile(tilemap: Readonly<Tilemap>, col: number, row: number): number {
  const { columns, rows, tiles } = tilemap.data;
  if (col < 0 || col >= columns || row < 0 || row >= rows) return -1;
  return tiles[row * columns + col];
}

export function resizeTilemap(tilemap: Tilemap, columns: number, rows: number): void {
  const data = tilemap.data;
  const newTiles = new Int16Array(columns * rows).fill(-1);
  const copyColumns = Math.min(columns, data.columns);
  const copyRows = Math.min(rows, data.rows);
  for (let r = 0; r < copyRows; r++) {
    for (let c = 0; c < copyColumns; c++) {
      newTiles[r * columns + c] = data.tiles[r * data.columns + c];
    }
  }
  data.columns = columns;
  data.rows = rows;
  data.tiles = newTiles;
}

export function writeTilemapTile(tilemap: Tilemap, col: number, row: number, id: number): void {
  const { columns, rows, tiles } = tilemap.data;
  if (col < 0 || col >= columns || row < 0 || row >= rows) return;
  tiles[row * columns + col] = id;
}

const defaultMethods: Partial<MethodsOf<TilemapRuntime>> = {
  computeLocalBoundsRectangle: computeTilemapLocalBoundsRectangle,
};
