import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { FontResource } from '@flighthq/types/contract';

export function createFontResource(family: string): FontResource {
  const out = allocateEntity<FontResource>();
  out.family = family;
  out.face = null;
  return finishEntity(out);
}
