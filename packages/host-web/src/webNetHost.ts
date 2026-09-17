import type { HostNetCapabilities } from '@flighthq/types/contract';

import { webHostNet } from './webNet';

export const webHostNetGroup = {
  http: webHostNet,
} satisfies HostNetCapabilities;
