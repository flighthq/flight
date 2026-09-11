import { createHost } from '@flighthq/entity/contract';

import { webHostPower } from './webPower';

export const webPowerHost = /* @__PURE__ */ createHost({ power: webHostPower });
