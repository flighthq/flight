import type { DisplayObject, PartialWithData } from '@flighthq/types';
import { BlendMode, GraphState } from '@flighthq/types';

import type { DisplayObjectInternal } from './internal/writeInternal';

export function createDisplayObject(obj?: PartialWithData<DisplayObject>): DisplayObject {
  return {
    alpha: obj?.alpha ?? 1,
    blendMode: obj?.blendMode ?? BlendMode.Normal,
    cacheAsBitmap: obj?.cacheAsBitmap ?? false,
    cacheAsBitmapMatrix: obj?.cacheAsBitmapMatrix ?? null,
    children: (obj as DisplayObjectInternal)?.children ?? null,
    colorTransform: obj?.colorTransform ?? null,
    data: obj?.data ?? null,
    filters: obj?.filters ?? null,
    mask: obj?.mask ?? null,
    name: obj?.name ?? null,
    opaqueBackground: obj?.opaqueBackground ?? null,
    parent: (obj as DisplayObjectInternal)?.parent ?? null,
    rotation: obj?.rotation ?? 0,
    scale9Grid: obj?.scale9Grid ?? null,
    scaleX: obj?.scaleX ?? 1,
    scaleY: obj?.scaleY ?? 1,
    scrollRect: obj?.scrollRect ?? null,
    shader: obj?.shader ?? null,
    stage: (obj as DisplayObjectInternal)?.stage ?? null,
    type: obj?.type ?? 'container',
    visible: obj?.visible ?? true,
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,

    [GraphState.SymbolKey]: undefined,
  };
}
