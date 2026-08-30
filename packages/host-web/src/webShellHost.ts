import { createHost } from '@flighthq/entity/contract';
import type { HasShellExternal, Host } from '@flighthq/types/contract';

import { webShellExternalBackend } from './webShell';

export const webShellHost: Host & HasShellExternal = createHost({
  shell: { external: webShellExternalBackend },
});
