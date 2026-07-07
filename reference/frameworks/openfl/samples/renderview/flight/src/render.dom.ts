import type { Sprite } from '@flighthq/sdk';
import {
  createCanvasElement,
  createCanvasRenderState,
  createDomRenderState,
  createRenderView,
  defaultCanvasSpriteRenderer,
  defaultDomRenderViewRenderer,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasSprite,
  renderDomBackground,
  renderDomDisplayObject,
  RenderViewKind,
  SpriteKind,
} from '@flighthq/sdk';

const WIDTH = 256;
const HEIGHT = 256;

const spriteCanvas = createCanvasElement(WIDTH, HEIGHT);
const spriteState = createCanvasRenderState(spriteCanvas, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
  imageSmoothingEnabled: false,
});
registerRenderer(spriteState, SpriteKind, defaultCanvasSpriteRenderer);

let spriteRoot: Sprite | null = null;
const renderView = createRenderView({
  data: {
    width: WIDTH,
    height: HEIGHT,
    renderer: {
      canvas: spriteCanvas,
      render() {
        if (spriteRoot === null) return;
        if (!prepareDisplayObjectRender(spriteState, spriteRoot)) return;
        renderCanvasBackground(spriteState);
        renderCanvasSprite(spriteState, spriteRoot);
      },
    },
  },
});

const container = document.createElement('div');
container.style.position = 'relative';
container.style.width = `${WIDTH}px`;
container.style.height = `${HEIGHT}px`;
document.body.appendChild(container);

export const state = createDomRenderState(container, {
  sceneGraphSyncPolicy: 'requiresInvalidation',
  backgroundColor: 0xeeddccff,
});
registerRenderer(state, RenderViewKind, defaultDomRenderViewRenderer);
export const scale = 1;

export function render(root: Sprite): void {
  spriteRoot = root;
  if (!prepareDisplayObjectRender(state, renderView)) return;
  renderDomBackground(state);
  renderDomDisplayObject(state, renderView);
}
