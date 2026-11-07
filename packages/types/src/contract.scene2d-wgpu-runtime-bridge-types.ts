// Minimal runtime cycle bridge for scene2d-wgpu. SpriteRenderer combines Scene2D's Sprite with
// Render's renderer contracts, while Render already consumes Scene2D coverage contracts. Keeping
// that one structural interface here avoids a Scene2D ↔ Render owner cycle without exposing the full
// Types project to scene2d-wgpu.
import type { RendererData } from '@flighthq/node/contract';
import type { NodeRenderer, RenderProxy2D, RenderState } from '@flighthq/render/contract';
import type { Sprite } from '@flighthq/scene2d/contract';

export interface SpriteRenderer extends NodeRenderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}
