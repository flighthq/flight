import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Cursor, CursorBackend, Entity, EntityConstruction } from '@flighthq/types/contract';

export function createWebCursorBackend(element: HTMLElement): CursorBackend & Entity {
  const out = allocateEntity<CursorBackend & Entity>();
  initializeWebCursorBackend(out, element);
  return finishEntity(out);
}

export function initializeWebCursorBackend(
  out: EntityConstruction<CursorBackend & Entity>,
  element: HTMLElement,
): void {
  out.setCursor = (cursor: Cursor | null): void => {
    element.style.cursor = cursor ?? '';
  };
}
