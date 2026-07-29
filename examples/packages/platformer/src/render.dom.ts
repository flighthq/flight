import type { Node2D } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomShapeRenderer,
  defaultDomSpriteRenderer,
  defaultDomTextLabelRenderer,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerDomImageTextureResolver,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '500px';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0x87ceebff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerDomImageTextureResolver(state);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
