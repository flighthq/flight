import type { HostSocketCapabilities } from '@flighthq/types/contract';

import { webHostSocket } from './webSocket';

export const webHostSocketGroup = {
  connection: webHostSocket,
} satisfies HostSocketCapabilities;
