import { createHost } from '@flighthq/entity/contract';
import type { HostShellCapabilities } from '@flighthq/types/contract';

import { webHostShellExternal } from './webShell';

export const webHostShell = {
  external: webHostShellExternal,
} satisfies HostShellCapabilities;

export const webShellHost = /* @__PURE__ */ createHost({ shell: webHostShell });
