import type { HostShellCapabilities } from '@flighthq/types/contract';

import { webHostShellExternal } from './webShell.ts';

export const webHostShell = {
  external: webHostShellExternal,
} satisfies HostShellCapabilities;
