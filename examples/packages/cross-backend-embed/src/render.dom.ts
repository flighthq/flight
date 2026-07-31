import type { Node2D } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultDomHtmlViewRenderer,
  defaultDomSpriteRenderer,
  defaultDomTextLabelRenderer,
  HtmlViewKind,
  prepareScene2DRender,
  registerDomImageTextureResolver,
  registerRenderer,
  renderDomBackground,
  renderDomScene2D,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.width = '720px';
container.style.height = '380px';
document.body.style.margin = '0';
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  backgroundColor: 0x10141dff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerDomImageTextureResolver(state);
registerRenderer(state, HtmlViewKind, defaultDomHtmlViewRenderer);
registerRenderer(state, SpriteKind, defaultDomSpriteRenderer);
registerRenderer(state, TextLabelKind, defaultDomTextLabelRenderer);

export const canvas: HTMLElement = container;
export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomBackground(state);
  renderDomScene2D(state, root);
}
