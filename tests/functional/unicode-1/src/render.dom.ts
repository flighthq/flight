import { RichTextKind } from '@flighthq/sdk';

import { createDOMTarget } from '../../_harness/dom';

export const { height, render, width } = createDOMTarget({
  width: 1000,
  height: 700,
  background: 0xffffffff,
  kinds: [RichTextKind],
});
