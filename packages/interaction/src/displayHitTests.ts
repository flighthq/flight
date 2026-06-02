import type { SceneNode, SpriteBatch } from '@flighthq/types';

import { graphHitTestLocalBounds } from './hitTests';
import { defaultSpriteHitTestPoint } from './spriteHitTests';

export function defaultBitmapHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultDisplayObjectHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  return false;
}

export function defaultHTMLViewHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // HTMLView elements handle pointer events through the browser — not the canvas interaction system.
  return false;
}

export function defaultInputTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultMovieClipHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultRichTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultShapeHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultSpriteBatchHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  shapeFlag: boolean,
): boolean {
  const spriteBatch = source as SpriteBatch;
  if (spriteBatch.data.graph !== null) {
    return defaultSpriteHitTestPoint(spriteBatch.data.graph, x, y, shapeFlag);
  }
  return defaultDisplayObjectHitTestPoint(source, x, y, shapeFlag);
}

export function defaultStageHitTestPoint(
  _source: SceneNode<symbol, object>,
  _x: number,
  _y: number,
  _shapeFlag: boolean,
): boolean {
  // Containers have no self hit area — findGraphHitTarget traverses children separately.
  return false;
}

export function defaultTextHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}

export function defaultVideoHitTestPoint(
  source: SceneNode<symbol, object>,
  x: number,
  y: number,
  _shapeFlag: boolean,
): boolean {
  return graphHitTestLocalBounds(source, x, y);
}
