import { createHost } from '@flighthq/entity/contract';

import { webScreenCapabilities } from './webScreen';

export const webScreenHost = createHost({ screen: webScreenCapabilities });
