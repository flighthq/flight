import type { Bitmap, BitmapData, DisplayObjectRuntime, PartialWithData, Rectangle, SceneNode } from '@flighthq/types';
import { DisplayObjectKind, DisplayObjectType } from '@flighthq/types';

import { createPrimitive } from './primitive';
import { createDisplayObjectRuntime } from './runtime';

export function computeBitmapLocalBounds(out: Rectangle, source: SceneNode<typeof DisplayObjectKind>): void {
  const bitmapData: BitmapData = source.data as BitmapData;
  if (bitmapData.image) {
    out.width = bitmapData.image.width;
    out.height = bitmapData.image.height;
  }
}

export function createBitmap(obj?: PartialWithData<Bitmap>): Bitmap {
  return createPrimitive(DisplayObjectType.Bitmap, obj, createBitmapData, createBitmapRuntime) as Bitmap;
}

export function createBitmapData(data?: Partial<BitmapData>): BitmapData {
  return {
    image: data?.image ?? null,
    smoothing: data?.smoothing ?? true,
  };
}

export function createBitmapRuntime(): DisplayObjectRuntime {
  return createDisplayObjectRuntime(DisplayObjectKind, defaultMethods);
}

const defaultMethods: Partial<DisplayObjectRuntime> = {
  computeLocalBounds: computeBitmapLocalBounds,
};
