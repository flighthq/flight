import { createHost } from '@flighthq/entity/contract';
import type {
  HasConnectivityChange,
  HasConnectivityReachability,
  HasConnectivityStatus,
  Host,
} from '@flighthq/types/contract';

import { webConnectivityBackend } from './webConnectivity';

export const webConnectivityHost: Host & HasConnectivityChange & HasConnectivityReachability & HasConnectivityStatus =
  createHost({
    connectivity: {
      change: webConnectivityBackend,
      reachability: webConnectivityBackend,
      status: webConnectivityBackend,
    },
  });
