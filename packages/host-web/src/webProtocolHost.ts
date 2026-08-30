import { createHost } from '@flighthq/entity/contract';

import { createWebProtocolCapabilities } from './webProtocol';

export const webProtocolHost = createHost({ protocol: createWebProtocolCapabilities() });
