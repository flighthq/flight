import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Cursor, CursorBackend, Entity, EntityConstruction } from '@flighthq/types/contract';

export function createWebCursorBackend(element: HTMLElement): CursorBackend & Entity {
  const out = allocateEntity<CursorBackend>();
  out.setCursor = (cursor: Cursor | null): void => {
    element.style.cursor = cursor ?? '';
  };
  return finishEntity(out);
}
