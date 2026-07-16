import type { Cursor, CursorBackend } from '@flighthq/types';

/**
 * Web cursor backend: applies the resolved rollover cursor to a DOM element's `style.cursor`
 * (typically the render canvas). `setCursor(null)` clears back to the element's default. Pass the
 * result to `createInteractionManager` via `cursorBackend`, or assign it to `manager.cursorBackend`.
 *
 * The backend is held per manager rather than globally, so multiple canvases each drive their own
 * cursor zone. Import side-effect-free: this only constructs the backend; nothing is applied until
 * pointer dispatch resolves a rollover.
 */
export function createWebCursorBackend(element: HTMLElement): CursorBackend {
  return {
    setCursor(cursor: Cursor | null): void {
      element.style.cursor = cursor ?? '';
    },
  };
}
