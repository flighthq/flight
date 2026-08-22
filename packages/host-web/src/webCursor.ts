import type { Cursor, CursorBackend } from '@flighthq/types/contract';

export function createWebCursorBackend(element: HTMLElement): CursorBackend {
  return {
    setCursor(cursor: Cursor | null): void {
      element.style.cursor = cursor ?? '';
    },
  };
}
