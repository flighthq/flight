// Minimal runtime cycle bridge for scene2d. Sprite renderer identity hooks accept RenderState, while
// Render already consumes Scene2D contracts. Keeping that one owner type here avoids a
// Scene2D ↔ Render package cycle without exposing the full Types project to scene2d.
export type { RenderState } from '@flighthq/render/contract';
