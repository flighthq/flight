import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import {
  scene2dGlPipeline,
  createGlContextState,
  createGlContextFromCanvasElement,
  addNodeChild,
  addTextureAtlasRegion,
  appendQuadBatchInstance,
  createDisplayObject,
  createGlCanvasElement,
  createGlRenderState,
  createHtmlView,
  createImageResourceFromCanvas,
  createQuadBatch,
  createRectangle,
  createSprite,
  createTextLabel,
  createTexture,
  createTextureAtlas,
  defaultGlQuadBatchRenderer,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  prepareScene2DRender,
  QuadBatchKind,
  registerGlImageTextureResolver,
  registerRenderer,
  registerGlStandardMaterial,
  renderGlBackground,
  renderGlScene2D,
  setQuadBatchLocalBoundsRectangle,
} from '@flighthq/sdk';

import { render } from './render';

const PRODUCER_WIDTH = 280;
const PRODUCER_HEIGHT = 180;
const QUAD_SIZE = 24;
const INSTANCE_COUNT = 24;

// The producer is a complete WebGL renderer with its own scene, pixels, and cadence. Its canvas is
// deliberately not appended here: the DOM consumer owns placement and HtmlView will mount it.
enableHostWebGlRenderSurface();
const producerCanvas = createGlCanvasElement(PRODUCER_WIDTH, PRODUCER_HEIGHT);
const producerState = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(producerCanvas, {
      contextAttributes: { alpha: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  {
    backgroundColor: 0x18253dff,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  },
);
registerGlImageTextureResolver(producerState);
registerGlStandardMaterial(producerState);
registerRenderer(producerState, QuadBatchKind, defaultGlQuadBatchRenderer);

const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = QUAD_SIZE * 3;
atlasCanvas.height = QUAD_SIZE;
const atlasContext = atlasCanvas.getContext('2d')!;
for (let i = 0; i < 3; i++) {
  atlasContext.fillStyle = ['#ff6b6b', '#ffd166', '#5dd39e'][i];
  atlasContext.fillRect(i * QUAD_SIZE + 1, 1, QUAD_SIZE - 2, QUAD_SIZE - 2);
}

const atlas = createTextureAtlas({
  texture: createTexture({
    dimension: '2d',
    source: createImageResourceFromCanvas(atlasCanvas),
  }),
});
for (let i = 0; i < 3; i++) addTextureAtlasRegion(atlas, i * QUAD_SIZE, 0, QUAD_SIZE, QUAD_SIZE);

const producerRoot = createDisplayObject();
const batch = createQuadBatch();
batch.data.atlas = atlas;
for (let i = 0; i < INSTANCE_COUNT; i++) appendQuadBatchInstance(batch, i % 3, 0, 0);
setQuadBatchLocalBoundsRectangle(batch, createRectangle(0, 0, PRODUCER_WIDTH, PRODUCER_HEIGHT));
addNodeChild(producerRoot, batch);

// The consumer is an ordinary DOM scene. Both nodes below reference the same producer canvas, but
// their ownership contracts differ: Sprite borrows its pixels; HtmlView mounts the element itself.
const root = createDisplayObject();
const producerImage = createImageResourceFromCanvas(producerCanvas);
const portableSprite = createSprite();
portableSprite.data.texture = createTexture({ dimension: '2d', source: producerImage });
portableSprite.x = 24;
portableSprite.y = 92;
invalidateNodeLocalTransform(portableSprite);
addNodeChild(root, portableSprite);

const liveView = createHtmlView();
liveView.data.element = producerCanvas;
liveView.data.width = PRODUCER_WIDTH;
liveView.data.height = PRODUCER_HEIGHT;
liveView.x = 416;
liveView.y = 92;
invalidateNodeLocalTransform(liveView);
addNodeChild(root, liveView);

addLabel('ONE GL QUADBATCH PRODUCER, TWO DOM EMBEDS', 24, 18, 18, 0xe8edf7ff);
addLabel('PORTABLE — Sprite + canvas ImageResource', 24, 62, 13, 0x7ab8ffff);
addLabel('LIVE — HtmlView mounts the canvas', 416, 62, 13, 0x5dd39eff);
addLabel('copy / upload on every invalidated version', 24, 286, 12, 0x9aa7bdff);
const liveEventLabel = addLabel('zero-copy; click for a native DOM event', 416, 286, 12, 0x9aa7bdff);
addLabel('Producer owns pixels + cadence. Consumer owns placement.', 24, 336, 13, 0xd5dbeaff);

let phaseOffset = 0;
let clickCount = 0;
producerCanvas.addEventListener('click', () => {
  clickCount++;
  phaseOffset += 17;
  liveEventLabel.data.text = `native canvas clicks: ${clickCount}`;
  invalidateNodeAppearance(liveEventLabel);
});

let frame = 0;
function enterFrame(): void {
  frame++;
  const phase = (frame + phaseOffset) * 0.035;
  for (let i = 0; i < INSTANCE_COUNT; i++) {
    const column = i % 6;
    const row = Math.floor(i / 6);
    const offset = i * 0.47;
    batch.data.transforms[i * 2] = 10 + column * 44 + Math.sin(phase + offset) * 8;
    batch.data.transforms[i * 2 + 1] = 10 + row * 38 + Math.cos(phase * 1.3 + offset) * 8;
  }
  invalidateNodeAppearance(batch);

  if (prepareScene2DRender(producerState, producerRoot)) {
    renderGlBackground(producerState);
    renderGlScene2D(producerState, producerRoot);
  }

  // ImageResource is a borrowed host representation. Advancing its version publishes the producer's
  // new pixels; invalidating the Sprite schedules the consumer-side copy for this DOM frame.
  producerImage.version = (producerImage.version + 1) >>> 0;
  invalidateNodeAppearance(portableSprite);
  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);

function addLabel(text: string, x: number, y: number, size: number, color: number): ReturnType<typeof createTextLabel> {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { color, font: 'sans-serif', size };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  addNodeChild(root, label);
  return label;
}
