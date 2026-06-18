import { BitmapKind, RichTextKind, ShapeKind } from '@flighthq/sdk';

import { createDOMTarget } from '../../_harness/dom';

export const { height, render, width } = createDOMTarget({
  width: 1280,
  height: 720,
  background: 0xff000000,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});
