import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityConstruction } from '@flighthq/entity/contract';

import type { FontResource } from './types.ts';

export function createFontResource(family: string): FontResource {
  const out = allocateEntity<FontResource>();
  initializeFontResource(out, family);
  return finishEntity(out);
}

export function initializeFontResource(out: EntityConstruction<FontResource>, family: string): void {
  out.family = family;
  out.face = null;
}
