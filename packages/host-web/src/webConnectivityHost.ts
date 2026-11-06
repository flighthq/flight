import type { HostConnectivityCapabilities } from '@flighthq/host/contract';

import {
  webHostConnectivityChange,
  webHostConnectivityReachability,
  webHostConnectivityStatus,
} from './webConnectivity.ts';

export const webHostConnectivity = {
  change: webHostConnectivityChange,
  reachability: webHostConnectivityReachability,
  status: webHostConnectivityStatus,
} satisfies HostConnectivityCapabilities;
