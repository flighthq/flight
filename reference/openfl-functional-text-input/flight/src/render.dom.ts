import type { DisplayObject } from '@flighthq/sdk';
import {
  createDomRenderState,
  defaultDomRichTextRenderer,
  enableDomTextInput,
  prepareDisplayObjectRender,
  registerRenderer,
  renderDomBackground,
  renderDomDisplayObject,
  RichTextKind,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '300px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { backgroundColor: 0xffffffff });
registerRenderer(state, RichTextKind, defaultDomRichTextRenderer);
// Opt the RichText renderer into appending the editable-input caret/selection overlay.
enableDomTextInput();
export const scale = 1;
export const width = 800;
export const height = 300;

export function render(root: DisplayObject): void {
  if (!prepareDisplayObjectRender(state, root)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, root);
}
