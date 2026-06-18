import { RichTextKind } from '@flighthq/sdk';

import { createWebGLTarget } from '../../_harness/webgl';

export const { height, render, width } = createWebGLTarget({
  width: 1000,
  height: 400,
  background: 0xffffffff,
  kinds: [RichTextKind],
});
