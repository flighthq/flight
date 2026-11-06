import type { Cursor, CursorBackend } from '@flighthq/interaction/contract';

export function allocateWebCursorBackend(element: HTMLElement): CursorBackend {
  return {
    setCursor: (cursor: Cursor | null): void => {
      element.style.cursor = cursor ?? '';
    },
  };
}
