import { createEntity } from '@flighthq/entity/contract';
import type { EntityRuntimeKey, HasNetHttp } from '@flighthq/types/contract';

import { webNetBackend } from './webNet';

export const webHostNet = createEntity({
  net: { http: webNetBackend },
} as const satisfies Omit<HasNetHttp, typeof EntityRuntimeKey>);
