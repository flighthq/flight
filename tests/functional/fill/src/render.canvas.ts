import { ShapeKind } from '@flighthq/sdk';

import { createCanvasTarget } from '../../_harness/canvas';

export const { height, render, width } = createCanvasTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [ShapeKind],
});
