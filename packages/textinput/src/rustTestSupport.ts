import { createRichText } from '@flighthq/text/contract';
import type { RichText } from '@flighthq/text/contract';

export const rustTestSupport = {
  createDefaultRichText(): RichText {
    return createRichText();
  },
};
