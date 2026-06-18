import { BitmapKind, ShapeKind } from '@flighthq/sdk';

import { createCanvasTarget } from '../../_harness/canvas';

export const { height, render, width } = createCanvasTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  kinds: [BitmapKind, ShapeKind],
});
