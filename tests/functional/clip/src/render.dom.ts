import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createDOMTarget } from '../../_harness/dom';

export const { height, render, width } = createDOMTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  clip: true,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
