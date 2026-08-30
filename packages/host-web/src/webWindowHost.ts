import { createHost } from '@flighthq/entity/contract';

import { webWindowBackend } from './webWindow';

export const webWindowHost = createHost({ window: webWindowBackend });
