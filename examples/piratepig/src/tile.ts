import type { DisplayObject, ImageResource, InteractionManager, TweenManager } from '@flighthq/sdk';
import {
  addNodeChild,
  addNodeChildAt,
  captureInteractionPointer,
  connectSignal,
  createBitmap,
  createDisplayObject,
  createTween,
  enableInteractionSignals,
  getNodeLocalBoundsRectangle,
  getNodeParent,
  invalidateNodeRender,
  Quad,
  releaseInteractionPointer,
  removeNodeChild,
  setRectangle,
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

export interface TileInteractionOptions {
  coordScale?: number;
  cursorElement?: HTMLElement;
}

export function connectTileInteraction(
  tile: Tile,
  manager: InteractionManager<DisplayObject>,
  onDrag: (tile: Tile, dx: number, dy: number) => void,
  options?: TileInteractionOptions,
): void {
  const coordScale = options?.coordScale ?? 1;
  const cursorElement = options?.cursorElement ?? null;
  const dragThreshold = 10 * coordScale;
  const signals = enableInteractionSignals(tile.obj);
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  connectSignal(signals.onPointerDown, (data) => {
    if (tile.moving) return;
    captureInteractionPointer(manager, data.pointerId, tile.obj);
    startX = data.worldX;
    startY = data.worldY;
    isDragging = true;
  });

  connectSignal(signals.onPointerUp, (data) => {
    releaseInteractionPointer(manager, data.pointerId);
    if (!isDragging) return;
    isDragging = false;
    if (tile.moving) return;
    const dx = data.worldX - startX;
    const dy = data.worldY - startY;
    if (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold) {
      onDrag(tile, dx, dy);
    }
  });

  if (cursorElement !== null) {
    connectSignal(signals.onPointerOver, () => {
      cursorElement.style.cursor = tile.moving ? '' : 'pointer';
    });
    connectSignal(signals.onPointerMove, () => {
      cursorElement.style.cursor = tile.moving ? '' : 'pointer';
    });
    connectSignal(signals.onPointerOut, () => {
      cursorElement.style.cursor = '';
    });
  }
}

export function createTile(image: ImageResource, type: number): Tile {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, TILE_SIZE, TILE_SIZE);
  const bitmap = createBitmap();
  bitmap.data.image = image;
  bitmap.data.smoothing = true;
  addNodeChild(obj, bitmap);
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
  connectSignal(tween.onUpdate, () => invalidateNodeRender(tile.obj));
  connectSignal(tween.onComplete, () => {
    tile.moving = false;
    invalidateNodeRender(tile.obj);
  });
}

export function removeTileAnimated(manager: TweenManager, tile: Tile, tileContainer: DisplayObject): void {
  if (tile.removed) return;
  tile.removed = true;

  const half = TILE_SIZE / 2;
  addNodeChildAt(tileContainer, tile.obj, 0);

  const tween = createTween(
    manager,
    tile.obj,
    600,
    { alpha: 0, scaleX: 2, scaleY: 2, x: tile.obj.x - half, y: tile.obj.y - half },
    { ease: Quad.easeOut },
  );
  connectSignal(tween.onUpdate, () => invalidateNodeRender(tile.obj));
  connectSignal(tween.onComplete, () => {
    const parent = getNodeParent(tile.obj) as DisplayObject | null;
    if (parent !== null) removeNodeChild(parent, tile.obj);
    invalidateNodeRender(tileContainer);
  });
}

export function removeTileImmediate(tile: Tile, tileContainer: DisplayObject): void {
  tile.removed = true;
  const parent = getNodeParent(tile.obj) as DisplayObject | null;
  if (parent !== null) removeNodeChild(parent, tile.obj);
  invalidateNodeRender(tileContainer);
}
