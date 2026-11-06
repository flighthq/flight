import type { HostSocketCapabilities } from '@flighthq/socket/contract';

import { webHostSocket } from './webSocket.ts';

export const webHostSocketGroup = {
  connection: webHostSocket,
} satisfies HostSocketCapabilities;
