import type { HostConnectivityCapabilities } from '@flighthq/types/contract';

import {
  webHostConnectivityChange,
  webHostConnectivityReachability,
  webHostConnectivityStatus,
} from './webConnectivity';

export const webHostConnectivity = {
  change: webHostConnectivityChange,
  reachability: webHostConnectivityReachability,
  status: webHostConnectivityStatus,
} satisfies HostConnectivityCapabilities;
