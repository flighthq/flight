import {
  webHostGl,
  appendWebSurface,
  webHostSurfaceDisplay,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { renderGlScene3D } from '@flighthq/scene3d-gl';
import type { GlEffectState, Bitmap } from '@flighthq/sdk';
import {
  createGlSurface,
  glScene3DRenderPreset,
  addNodeChild,
  beginGlEffectPass,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlEffectState,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createRenderTexture,
  createUnlitMaterial,
  createVector3,
  endGlEffectPass,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  renderIntoGlRenderTexture,
  setCamera3DViewMatrix4FromLookAt,
  setSurfaceDisplaySize,
  createAppWindow,
  openWindow,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

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
const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, WIDTH * pixelRatio, HEIGHT * pixelRatio, {
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
setSurfaceDisplaySize(webHostSurfaceDisplay, glSurface, WIDTH, HEIGHT);
appendWebSurface(glSurface, document.body);

export const state = createGlRenderState(glSurface.context, { ...glScene3DRenderPreset, pixelRatio });
export const scale = pixelRatio;
export const width = WIDTH;
export const height = HEIGHT;

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
renderIntoGlRenderTexture(
  state,
  renderMap,
  (pass) => {
    prepareScene3DRender(pass.state, producerScene, producerCamera, lights);
    renderGlScene3D(pass, producerScene, producerCamera, lights);
  },
  { color: [0, 0, 0, 0], depth: 1.0, stencil: 0 },
);

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

const pipeline: GlEffectState = createGlEffectState(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});
const screenClear = { color: [0x08 / 0xff, 0x0b / 0xff, 0x12 / 0xff, 1], depth: 1.0 } as const;
const pass = beginGlEffectPass(state, pipeline, screenClear, 'linear');
prepareScene3DRender(state, consumerScene, consumerCamera, lights);
renderGlScene3D(pass, consumerScene, consumerCamera, lights);
endGlEffectPass(pass, pipeline, []);

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
