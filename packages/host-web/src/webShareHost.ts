import type { HostShareCapabilities } from '@flighthq/host/contract';

import { webHostShareContent, webHostShareFiles } from './webShare.ts';

export const webHostShare = {
  content: webHostShareContent,
  files: webHostShareFiles,
} satisfies HostShareCapabilities;
