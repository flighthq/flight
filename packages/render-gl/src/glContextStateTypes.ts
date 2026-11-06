import type { Entity } from '@flighthq/types/contract';

import type { GlContext } from './types.ts';

export interface GlContextState extends Entity {
  readonly gl: GlContext;
}
