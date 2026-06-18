import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createCanvasTarget } from '../../_harness/canvas';

export const { height, render, width } = createCanvasTarget({
  width: 1100,
  height: 700,
  background: 0xffffffff,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
