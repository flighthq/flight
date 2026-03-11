import type { Rectangle, TextureAtlas, TextureAtlasRegion, Vector2 } from '@flighthq/types';

export function addTextureAtlasRegion(
  target: TextureAtlas,
  x: number,
  y: number,
  width: number,
  height: number,
  pivotX?: number,
  pivotY?: number,
): void {
  target.regions.push(
    createTextureAtlasRegion({
      x: x,
      y: y,
      width: width,
      height: height,
      id: target.regions.length,
      pivotX: pivotX,
      pivotY: pivotY,
    }),
  );
}

export function addTextureAtlasRegionRect(target: TextureAtlas, rect: Rectangle, pivot?: Vector2): void {
  addTextureAtlasRegion(
    target,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    pivot ? pivot.x : undefined,
    pivot ? pivot.y : undefined,
  );
}

export function addTextureAtlasRegionRectXY(
  target: TextureAtlas,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pivotX?: number,
  pivotY?: number,
): void {
  addTextureAtlasRegion(target, ax, ay, bx - ax, by - ay, pivotX, pivotY);
}

export function addTextureAtlasRegionVec2(target: TextureAtlas, a: Vector2, b: Vector2, pivot?: Vector2): void {
  addTextureAtlasRegion(
    target,
    a.x,
    a.y,
    b.x - a.x,
    b.y - a.y,
    pivot ? pivot.x : undefined,
    pivot ? pivot.y : undefined,
  );
}

export function createTextureAtlas(obj?: Partial<TextureAtlas>): TextureAtlas {
  return {
    image: obj?.image ?? null,
    regions: obj?.regions ?? [],
  };
}

export function createTextureAtlasRegion(obj?: Partial<TextureAtlasRegion>): TextureAtlasRegion {
  return {
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
    width: obj?.width ?? 0,
    height: obj?.height ?? 0,
    id: obj?.id ?? -1,
    pivotX: obj?.pivotX ?? 0,
    pivotY: obj?.pivotY ?? 0,
  };
}

export function initTextureAtlasRegion(
  out: TextureAtlasRegion,
  x: number,
  y: number = 0,
  width: number = 0,
  height: number = 0,
  pivotX: number = 0,
  pivotY: number = 0,
) {
  out.x = x;
  out.y = y;
  out.width = width;
  out.height = height;
  out.pivotX = pivotX;
  out.pivotY = pivotY;
}
