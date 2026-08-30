import { createHost } from '@flighthq/entity/contract';

import { webNetBackend } from './webNet';
import { webSocketBackend } from './webSocket';

export const webHostNet = createHost({
  net: { http: webNetBackend, socket: webSocketBackend },
});
