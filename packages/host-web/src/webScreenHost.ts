import { createHost } from '@flighthq/entity/contract';

import { webHostScreen } from './webScreen';

export const webScreenHost = /* @__PURE__ */ createHost({ screen: webHostScreen });
