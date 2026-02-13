import type { DisplayObject, DisplayObjectContainer } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

export function createDisplayObject(obj: Partial<DisplayObject> = {}): DisplayObject {
  if (obj.alpha === undefined) obj.alpha = 1;
  if (obj.blendMode === undefined) obj.blendMode = BlendMode.Normal;
  if (obj.cacheAsBitmap === undefined) obj.cacheAsBitmap = false;
  if (obj.cacheAsBitmapMatrix === undefined) obj.cacheAsBitmapMatrix = null;
  if (obj.filters === undefined) obj.filters = null;
  if (obj.mask === undefined) obj.mask = null;
  if (obj.name === undefined) obj.name = null;
  if (obj.opaqueBackground === undefined) obj.opaqueBackground = null;
  if (obj.parent === undefined) (obj as DisplayObjectInternal).parent = null;
  if (obj.rotation === undefined) obj.rotation = 0;
  if (obj.scale9Grid === undefined) obj.scale9Grid = null;
  if (obj.scaleX === undefined) obj.scaleX = 1;
  if (obj.scaleY === undefined) obj.scaleY = 1;
  if (obj.scrollRect === undefined) obj.scrollRect = null;
  if (obj.shader === undefined) obj.shader = null;
  if (obj.stage === undefined) (obj as DisplayObjectInternal).stage = null;
  if (obj.visible === undefined) obj.visible = true;
  if (obj.x === undefined) obj.x = 0;
  if (obj.y === undefined) obj.y = 0;
  return obj as DisplayObject;
}

type DisplayObjectInternal = Omit<DisplayObject, 'parent' | 'stage'> & {
  parent: DisplayObjectContainer | null;
  stage: DisplayObjectContainer | null;
};
