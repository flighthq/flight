import { BitmapKind, RichTextKind } from '@flighthq/sdk';

import { createDOMTarget } from '../../_harness/dom';

export const { height, render, width } = createDOMTarget({
  width: 800,
  height: 400,
  background: 0xffffffff,
  kinds: [BitmapKind, RichTextKind],
});
