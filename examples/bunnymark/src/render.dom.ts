import type { QuadBatch } from '@flighthq/engine';
import {
  createDOMRenderState,
  defaultDOMQuadBatchRenderer,
  QuadBatchKind,
  registerRenderer,
  renderDOMBackground,
  renderDOMSprite,
} from '@flighthq/engine';

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
  renderDOMBackground(state);
  renderDOMSprite(state, root);
}
