import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createCanvasTarget } from '../../_harness/canvas';

export const { height, render, width } = createCanvasTarget({
  width: 1280,
  height: 720,
  background: 0xff000000,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
