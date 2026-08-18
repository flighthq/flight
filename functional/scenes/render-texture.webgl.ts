import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { GlRenderEffectPipeline, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createRenderTexture,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  registerGlUnlitMaterial,
  renderGlBackground,
  renderIntoGlRenderTexture,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'On an 800×600 near-black navy field (about R8 G11 B18), a large perspective box is centred in ' +
    'view. Its front-facing texture is upright: a flat coral-red horizontal slab occupies the upper ' +
    'half and a flat strong-blue slab the lower half, with the dividing line horizontal. The angled ' +
    'side of the box preserves the same top-over-bottom orientation. The colours are not vertically ' +
    'flipped, swapped, stretched into one solid colour or replaced by black, and the field remains ' +
    'visible around the bounded cube silhouette.',
);

const WIDTH = 800;
const HEIGHT = 600;
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(WIDTH, HEIGHT, pixelRatio);
document.body.appendChild(canvas);
export const state = createGlRenderState(canvas, {
  backgroundColor: 0x080b12ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
});
export const scale = pixelRatio;
export const width = WIDTH;
export const height = HEIGHT;

registerStandardGlTextureResolvers(state);
registerGlUnlitMaterial(state);

const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, -1, 0), intensity: 0 }),
};

// Producer scene A: two asymmetric horizontal slabs make target orientation unambiguous.
const producerScene = createScene3D().root;
const top = createMesh(createBoxMeshGeometry(1.8, 0.9, 0.1), [createUnlitMaterial({ baseColor: 0xef3f48ff })]);
top.position.y = 0.45;
invalidateNodeLocalTransform(top);
addNodeChild(producerScene, top);
const bottom = createMesh(createBoxMeshGeometry(1.8, 0.9, 0.1), [createUnlitMaterial({ baseColor: 0x267be8ff })]);
bottom.position.y = -0.45;
invalidateNodeLocalTransform(bottom);
addNodeChild(producerScene, bottom);

const producerCamera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1.15, halfWidth: 1.15 }),
});
setCamera3DViewMatrix4FromLookAt(
  producerCamera,
  createVector3(0, 0, 3),
  createVector3(0, 0, 0),
  createVector3(0, 1, 0),
);

const renderMap = createRenderTexture({ depth: 'depth-stencil', height: 256, width: 256 });
renderIntoGlRenderTexture(state, renderMap, (glState) => {
  prepareScene3DRender(glState, producerScene, producerCamera, lights);
  drawGlScene3D(glState, producerScene, producerCamera, lights);
});

// Consumer scene B: the finished attachment becomes an UnlitMaterial map on an ordinary cube.
const consumerScene = createScene3D().root;
addNodeChild(
  consumerScene,
  createMesh(createBoxMeshGeometry(1.8, 1.8, 1.8), [
    createUnlitMaterial({ baseColor: 0xffffffff, baseColorMap: renderMap }),
  ]),
);
const consumerCamera = createCamera3D({
  far: 10,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: WIDTH / HEIGHT, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(
  consumerCamera,
  createVector3(2.2, 0, 4.2),
  createVector3(0, 0, 0),
  createVector3(0, 1, 0),
);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 4,
});
beginGlRenderEffectPipeline(state, pipeline, 'linear');
renderGlBackground(state);
prepareScene3DRender(state, consumerScene, consumerCamera, lights);
drawGlScene3D(state, consumerScene, consumerCamera, lights);
endGlRenderEffectPipeline(state, pipeline, []);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const topSample = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.5), Math.floor(bitmap.height * 0.42));
  const bottomSample = getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * 0.5), Math.floor(bitmap.height * 0.58));
  if (!isRed(topSample) || !isBlue(bottomSample)) {
    throw new Error(
      `[render-texture] expected upright red/blue producer result on the consumer cube, got #${hex(
        topSample,
      )} above #${hex(bottomSample)}`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 120 && channel(rgb, 16) < 90;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 120 && channel(rgb, 0) < 100;
}
