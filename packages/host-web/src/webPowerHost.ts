import { createHost } from '@flighthq/entity/contract';

import { webPowerCapabilities } from './webPower';

export const webPowerHost = createHost({ power: webPowerCapabilities });
