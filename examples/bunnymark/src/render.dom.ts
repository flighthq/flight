import type { QuadBatch } from '@flighthq/sdk';
import {
  createDOMRenderState,
  defaultDOMQuadBatchRenderer,
  prepareSpriteRender,
  QuadBatchKind,
  registerRenderer,
  renderDOMBackground,
  renderDOMSprite,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '550px';
container.style.height = '400px';
document.body.appendChild(container);

export const canvas = container;
export const state = createDOMRenderState(container, { backgroundColor: 0xeeddccff });
registerRenderer(state, QuadBatchKind, defaultDOMQuadBatchRenderer);
export const scale = 1;

export function render(root: QuadBatch): void {
  if (!prepareSpriteRender(state, root)) return;
  renderDOMBackground(state);
  renderDOMSprite(state, root);
}
