import type { HostSocketCapabilities } from '@flighthq/types/contract';

import { webHostSocket } from './webSocket.ts';

export const webHostSocketGroup = {
  connection: webHostSocket,
} satisfies HostSocketCapabilities;
