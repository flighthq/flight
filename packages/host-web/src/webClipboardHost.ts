import { createHost } from '@flighthq/entity/contract';
import type {
  HasClipboardChange,
  HasClipboardFormats,
  HasClipboardImage,
  HasClipboardText,
  Host,
} from '@flighthq/types/contract';

import { webClipboardBackend } from './webClipboard';

export const webClipboardHost: Host & HasClipboardChange & HasClipboardFormats & HasClipboardImage & HasClipboardText =
  createHost({
    clipboard: {
      change: webClipboardBackend,
      formats: webClipboardBackend,
      image: webClipboardBackend,
      text: webClipboardBackend,
    },
  });
