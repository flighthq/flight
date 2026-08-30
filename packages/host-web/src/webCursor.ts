import { createEntity } from '@flighthq/entity/contract';
import type { Cursor, CursorBackend, Entity } from '@flighthq/types/contract';

export function createWebCursorBackend(element: HTMLElement): CursorBackend & Entity {
  return createEntity({
    setCursor(cursor: Cursor | null): void {
      element.style.cursor = cursor ?? '';
    },
  } satisfies CursorBackend);
}
