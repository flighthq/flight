import { BitmapKind, RichTextKind } from '@flighthq/sdk';

import { createWebGLTarget } from '../../_harness/webgl';

export const { height, render, width } = createWebGLTarget({
  width: 800,
  height: 400,
  background: 0xffffffff,
  kinds: [BitmapKind, RichTextKind],
});
