import type { Node2D, LogState } from '@flighthq/sdk';
import {
  createDomRenderState,
  domSpriteRenderer,
  enableFlightDiagnostics,
  prepareScene2DRender,
  registerDomImageTextureResolver,
  registerNodeRenderer,
  renderDomScene2D,
  SpriteKind,
  createLogState,
  createDebugState,
} from '@flighthq/sdk';

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = '800px';
container.style.height = '500px';
document.body.appendChild(container);

export const state = createDomRenderState(container, { sceneGraphSyncPolicy: 'requiresInvalidation' });
// DOM has no pass and no clear: the background is a CSS property on the element the caller
// already holds, set once rather than reapplied by a render function every frame.
container.style.backgroundColor = '#1a1a2e';
// The runner publishes the page's LogState; a standalone build logs into a private one.
const logState = (window as { __flightLogState?: LogState }).__flightLogState ?? createLogState();
enableFlightDiagnostics(createDebugState(), logState, state);

registerNodeRenderer(state, SpriteKind, domSpriteRenderer);
registerDomImageTextureResolver(state);

export const canvas: HTMLElement = container;

export const scale = 1;

export function render(root: Node2D): void {
  if (!prepareScene2DRender(state, root)) return;
  renderDomScene2D(state, root);
}
