import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { FontResource, EntityConstruction } from '@flighthq/types/contract';

export function createFontResource(family: string): FontResource {
  const out = allocateEntity<FontResource>();
  initializeFontResource(out, family);
  return finishEntity(out);
}

export function initializeFontResource(out: EntityConstruction<FontResource>, family: string): void {
  out.family = family;
  out.face = null;
}
