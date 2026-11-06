import type { HostShellCapabilities } from '@flighthq/shell/contract';

import { webHostShellExternal } from './webShell.ts';

export const webHostShell = {
  external: webHostShellExternal,
} satisfies HostShellCapabilities;
