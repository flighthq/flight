import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createDOMTarget } from '../../_harness/dom';

export const { height, render, width } = createDOMTarget({
  width: 1100,
  height: 700,
  background: 0xffffffff,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
