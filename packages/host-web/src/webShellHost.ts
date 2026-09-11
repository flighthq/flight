import type { HostShellCapabilities } from '@flighthq/types/contract';

import { webHostShellExternal } from './webShell';

export const webHostShell = {
  external: webHostShellExternal,
} satisfies HostShellCapabilities;
