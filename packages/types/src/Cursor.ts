/**
 * CSS-compatible cursor identifier for per-node cursor management. Folded into the
 * interaction layer following the OpenFL `buttonMode`/`useHandCursor` pattern and
 * Pixi's `cursor` property. The interaction manager resolves the cursor of the
 * current rollover target and applies it through the active `CursorBackend`.
 */
export type Cursor =
  | 'alias'
  | 'all-scroll'
  | 'auto'
  | 'cell'
  | 'col-resize'
  | 'context-menu'
  | 'copy'
  | 'crosshair'
  | 'default'
  | 'e-resize'
  | 'ew-resize'
  | 'grab'
  | 'grabbing'
  | 'help'
  | 'move'
  | 'n-resize'
  | 'ne-resize'
  | 'nesw-resize'
  | 'no-drop'
  | 'none'
  | 'not-allowed'
  | 'ns-resize'
  | 'nw-resize'
  | 'nwse-resize'
  | 'pointer'
  | 'progress'
  | 'row-resize'
  | 's-resize'
  | 'se-resize'
  | 'sw-resize'
  | 'text'
  | 'vertical-text'
  | 'w-resize'
  | 'wait'
  | 'zoom-in'
  | 'zoom-out'
  | (string & Record<never, never>);
/**
 * Backend seam for applying cursor changes driven by pointer rollover. The web backend
 * (`createWebCursorBackend`) sets `element.style.cursor`; native hosts provide their own. A backend
 * is held per `InteractionManager` (`manager.cursorBackend`), not globally. `setCursor(null)` clears
 * to the element/host default.
 */
export interface CursorBackend {
  setCursor(cursor: Cursor | null): void;
}
