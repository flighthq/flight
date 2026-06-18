import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createWebGLTarget } from '../../_harness/webgl';

export const { height, render, width } = createWebGLTarget({
  width: 1280,
  height: 720,
  background: 0xff000000,
  clip: true,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
