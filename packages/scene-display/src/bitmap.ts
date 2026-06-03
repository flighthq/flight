import type { Bitmap, BitmapData, BitmapRuntime, MethodsOf, PartialNode, Rectangle, SceneNode } from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime, getDisplayObjectRuntime } from './displayObject';

export function computeBitmapLocalBoundsRectangle(out: Rectangle, source: Readonly<SceneNode>): void {
  const bitmapData: BitmapData = source.data as BitmapData;
  if (bitmapData.sourceRectangle !== null) {
    out.width = bitmapData.sourceRectangle.width;
    out.height = bitmapData.sourceRectangle.height;
  } else if (bitmapData.image) {
    out.width = bitmapData.image.width;
    out.height = bitmapData.image.height;
  }
}

export function createBitmap(obj?: Readonly<PartialNode<Bitmap>>): Bitmap {
  return createDisplayObjectGeneric(BitmapKind, obj, createBitmapData, createBitmapRuntime) as Bitmap;
}

export function createBitmapData(data?: Readonly<Partial<BitmapData>>): BitmapData {
  return {
    image: data?.image ?? null,
    smoothing: data?.smoothing ?? true,
    sourceRectangle: data?.sourceRectangle ?? null,
  };
}

export function createBitmapRuntime(): BitmapRuntime {
  return createDisplayObjectRuntime(defaultMethods) as BitmapRuntime;
}

export function getBitmapRuntime(source: Readonly<Bitmap>): Readonly<BitmapRuntime> {
  return getDisplayObjectRuntime(source) as BitmapRuntime;
}

const defaultMethods: Partial<MethodsOf<BitmapRuntime>> = {
  computeLocalBoundsRect: computeBitmapLocalBoundsRectangle,
};
