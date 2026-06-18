import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createCanvasTarget } from '../../_harness/canvas';

export const { height, render, width } = createCanvasTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  clip: true,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
