import type { HostNetCapabilities } from '@flighthq/types/contract';

import { webHostNet } from './webNet';
import { webHostSocket } from './webSocket';

export const webHostNetGroup = {
  http: webHostNet,
  socket: webHostSocket,
} satisfies HostNetCapabilities;
