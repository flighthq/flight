import type { Node2D } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultCanvasShapeCommands,
  defaultDomRichTextRenderer,
  defaultDomShapeRenderer,
  defaultDomTextLabelRenderer,
  enableDomTextInput,
  prepareScene2DRender,
  registerCanvasShapeCommands,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  RichTextKind,
  ShapeKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '600px';
document.body.style.margin = '0';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0xd0d0d0ff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
registerRenderer(state, ShapeKind, defaultDomShapeRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);
enableDomTextInput();

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
