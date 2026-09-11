import { createHost } from '@flighthq/entity/contract';

import { webHostWindow } from './webWindow';

export const webWindowHost = createHost({ window: webHostWindow });
