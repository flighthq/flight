import type { DisplayObject, PartialWithData, Rectangle } from '@flighthq/types';
import { BlendMode, GraphStateKey } from '@flighthq/types';

import { createGraphState } from './graphState';
import type { DisplayObjectInternal } from './internal';

export type DisplayObjectDataFactory<D extends object> = (obj?: Partial<D>, defaults?: D) => D;

export function createPrimitive<T extends DisplayObject, D extends object>(
  kind: symbol,
  obj?: PartialWithData<T>,
  createDisplayObjectData?: DisplayObjectDataFactory<D>,
  computeLocalBounds?: (out: Rectangle, source: DisplayObject) => void,
): T {
  return {
    alpha: obj?.alpha ?? 1,
    blendMode: obj?.blendMode ?? BlendMode.Normal,
    cacheAsBitmap: obj?.cacheAsBitmap ?? false,
    cacheAsBitmapMatrix: obj?.cacheAsBitmapMatrix ?? null,
    children: (obj as DisplayObjectInternal)?.children ?? null,
    colorTransform: obj?.colorTransform ?? null,
    data: createDisplayObjectData !== undefined ? createDisplayObjectData(obj?.data as Partial<D>) : null,
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
    kind: obj?.kind ?? kind,
    visible: obj?.visible ?? true,
    x: obj?.x ?? 0,
    y: obj?.y ?? 0,
    [GraphStateKey]: createGraphState(computeLocalBounds),
  } as T;
}
