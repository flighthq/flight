import type { NodeRenderer } from '@flighthq/render/contract';
import type { RenderProxy2D } from '@flighthq/render/contract';
import type { RenderState } from '@flighthq/render/contract';

import type { RendererData } from './RendererData.ts';
import type { Sprite } from './Sprite.ts';

export interface SpriteRenderer extends NodeRenderer {
  createData(state: RenderState, source: Sprite): RendererData | null;
  submit(state: RenderState, node: RenderProxy2D): void;
}
