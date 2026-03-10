import type {
  Bitmap,
  BitmapData,
  DisplayGraph,
  DisplayObjectRuntime,
  GraphNode,
  HasBoundsRect,
  PartialWithData,
  Rectangle,
} from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime } from './displayObject';

export function computeBitmapLocalBoundsRect(
  out: Rectangle,
  source: Readonly<GraphNode<typeof DisplayGraph> & HasBoundsRect<typeof DisplayGraph>>,
): void {
  const bitmapData: BitmapData = source.data as BitmapData;
  if (bitmapData.image) {
    out.width = bitmapData.image.width;
    out.height = bitmapData.image.height;
  }
}

export function createBitmap(obj?: Readonly<PartialWithData<Bitmap>>): Bitmap {
  return createDisplayObjectGeneric(BitmapKind, obj, createBitmapData, createBitmapRuntime) as Bitmap;
}

export function createBitmapData(data?: Readonly<Partial<BitmapData>>): BitmapData {
  return {
    image: data?.image ?? null,
    smoothing: data?.smoothing ?? true,
  };
}

export function createBitmapRuntime(): DisplayObjectRuntime {
  return createDisplayObjectRuntime(defaultMethods);
}

const defaultMethods: Partial<DisplayObjectRuntime> = {
  computeLocalBoundsRect: computeBitmapLocalBoundsRect,
};
