import { createHost } from '@flighthq/entity/contract';
import type { HostClipboardCapabilities } from '@flighthq/types/contract';

import {
  webHostClipboardChange,
  webHostClipboardFormats,
  webHostClipboardImage,
  webHostClipboardText,
} from './webClipboard';

export const webHostClipboard = {
  change: webHostClipboardChange,
  formats: webHostClipboardFormats,
  image: webHostClipboardImage,
  text: webHostClipboardText,
} satisfies HostClipboardCapabilities;

export const webClipboardHost = /* @__PURE__ */ createHost({ clipboard: webHostClipboard });
