import type {
  Bitmap,
  BitmapData,
  DisplayObjectRuntime,
  GraphNode,
  MethodsOf,
  PartialNode,
  Rectangle,
} from '@flighthq/types';
import { BitmapKind } from '@flighthq/types';

import { createDisplayObjectGeneric, createDisplayObjectRuntime } from './displayObject';

export function computeBitmapLocalBoundsRect(out: Rectangle, source: Readonly<GraphNode>): void {
  const bitmapData: BitmapData = source.data as BitmapData;
  if (bitmapData.image) {
    out.width = bitmapData.image.width;
    out.height = bitmapData.image.height;
  }
}

export function createBitmap(obj?: Readonly<PartialNode<Bitmap>>): Bitmap {
  return createDisplayObjectGeneric(BitmapKind, obj, createBitmapData, createBitmapRuntime as any) as Bitmap; // eslint-disable-line
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

const defaultMethods: Partial<MethodsOf<DisplayObjectRuntime>> = {
  computeLocalBoundsRect: computeBitmapLocalBoundsRect,
};
