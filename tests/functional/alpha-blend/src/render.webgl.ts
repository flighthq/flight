import { ShapeKind } from '@flighthq/sdk';

import { createWebGLTarget } from '../../_harness/webgl';

export const { height, render, width } = createWebGLTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  kinds: [ShapeKind],
});
