import type { HostClipboardCapabilities } from '@flighthq/clipboard/contract';

import {
  webHostClipboardChange,
  webHostClipboardFormats,
  webHostClipboardImage,
  webHostClipboardText,
} from './webClipboard.ts';

export const webHostClipboard = {
  change: webHostClipboardChange,
  formats: webHostClipboardFormats,
  image: webHostClipboardImage,
  text: webHostClipboardText,
} satisfies HostClipboardCapabilities;
