import type { HostNetCapabilities } from '@flighthq/net/contract';

import { webHostNet } from './webNet.ts';

export const webHostNetGroup = {
  http: webHostNet,
} satisfies HostNetCapabilities;
