import { createHost } from '@flighthq/entity/contract';
import type { HostShareCapabilities } from '@flighthq/types/contract';

import { webHostShareContent, webHostShareFiles } from './webShare';

export const webHostShare = {
  content: webHostShareContent,
  files: webHostShareFiles,
} satisfies HostShareCapabilities;

export const webShareHost = /* @__PURE__ */ createHost({ share: webHostShare });
