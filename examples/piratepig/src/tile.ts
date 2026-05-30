import type { DisplayObject, ImageSource, TweenManager } from '@flighthq/sdk';
import {
  addGraphChild,
  addGraphChildAt,
  connectSignal,
  createBitmap,
  createDisplayObject,
  createTween,
  getGraphParent,
  invalidateRender,
  Quad,
  removeGraphChild,
} from '@flighthq/sdk';

export const TILE_SIZE = 57;
export const TILE_STEP = TILE_SIZE + 16;

export interface Tile {
  obj: DisplayObject;
  column: number;
  row: number;
  type: number;
  moving: boolean;
  removed: boolean;
}

export function createTile(image: ImageSource, type: number): Tile {
  const obj = createDisplayObject();
  const bitmap = createBitmap();
  bitmap.data.image = image;
  bitmap.data.smoothing = true;
  addGraphChild(obj, bitmap);
  return { obj, column: 0, row: 0, type, moving: false, removed: false };
}

export function initTile(tile: Tile): void {
  tile.moving = false;
  tile.removed = false;
  tile.obj.alpha = 1;
  tile.obj.scaleX = 1;
  tile.obj.scaleY = 1;
}

export function moveTile(manager: TweenManager, tile: Tile, duration: number, targetX: number, targetY: number): void {
  tile.moving = true;
  const tween = createTween(manager, tile.obj, duration, { x: targetX, y: targetY }, { ease: Quad.easeOut });
  connectSignal(tween.onUpdate, () => invalidateRender(tile.obj));
  connectSignal(tween.onComplete, () => {
    tile.moving = false;
    invalidateRender(tile.obj);
  });
}

export function removeTileAnimated(manager: TweenManager, tile: Tile, tileContainer: DisplayObject): void {
  if (tile.removed) return;
  tile.removed = true;

  const half = TILE_SIZE / 2;
  addGraphChildAt(tileContainer, tile.obj, 0);

  const tween = createTween(
    manager,
    tile.obj,
    600,
    { alpha: 0, scaleX: 2, scaleY: 2, x: tile.obj.x - half, y: tile.obj.y - half },
    { ease: Quad.easeOut },
  );
  connectSignal(tween.onUpdate, () => invalidateRender(tile.obj));
  connectSignal(tween.onComplete, () => {
    const parent = getGraphParent(tile.obj) as DisplayObject | null;
    if (parent !== null) removeGraphChild(parent, tile.obj);
    invalidateRender(tileContainer);
  });
}

export function removeTileImmediate(tile: Tile, tileContainer: DisplayObject): void {
  tile.removed = true;
  const parent = getGraphParent(tile.obj) as DisplayObject | null;
  if (parent !== null) removeGraphChild(parent, tile.obj);
  invalidateRender(tileContainer);
}
