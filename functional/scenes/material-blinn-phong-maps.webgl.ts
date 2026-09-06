import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, GlRenderEffectPipeline, Node3D, Scene3DLights, Texture } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBitmap,
  createBlinnPhongMaterial,
  createQuadMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createSampler,
  createScene3DLights,
  createTexture,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  scene2dGlPipeline,
  setBitmapPixel,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800x600 near-black field, three square Blinn-Phong panels sit in one horizontal row. The left ' +
    'panel is split into a red left half and blue right half by its diffuse map. The centre grey panel is ' +
    'split by its tangent-space normal map: its left half faces the upper-right light and is much brighter ' +
    'than its right half. The right charcoal panel is split by its specular map: the left half suppresses ' +
    'the highlight while the right half carries a broad pale highlight. All three remain continuous square ' +
    'silhouettes; no map is replaced by a uniform colour and no panel is absent.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  { backgroundColor: 0x080b12ff, pixelRatio },
);
registerStandardGlTextureResolvers(state);
registerGlBlinnPhongMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});

function createStripTexture(left: number, right: number, linear: boolean = false): Texture {
  const bitmap = createBitmap(2, 1);
  setBitmapPixel(bitmap, 0, 0, left);
  setBitmapPixel(bitmap, 1, 0, right);
  return createTexture({
    colorSpace: linear ? 'linear' : 'srgb',
    dimension: '2d',
    sampler: createSampler({ magFilter: 'nearest', minFilter: 'nearest' }),
    source: bitmap,
  });
}

// A flat camera-facing quad, not a slab. A thin BOX here put each off-centre panel's inward side
// face in view, and every box face carries its own full 0..1 UV, so that face redrew the whole map
// as a ~3px strip down the panel's edge — read as a rendering fault more than once. The quad has
// only the surface the scene is about.
const geometry = createQuadMeshGeometry(1.6, 1.6);
const diffusePanel = createMesh(geometry, [
  createBlinnPhongMaterial({
    diffuse: 0xffffffff,
    diffuseMap: createStripTexture(0xe82828ff, 0x2848e8ff),
    shininess: 8,
    specular: 0x000000ff,
  }),
]);
diffusePanel.position.x = -2;
invalidateNodeLocalTransform(diffusePanel);

const normalPanel = createMesh(geometry, [
  createBlinnPhongMaterial({
    diffuse: 0xb0b8c0ff,
    normalMap: createStripTexture(0xec80c8ff, 0x1480c8ff, true),
    normalScale: 1,
    shininess: 8,
    specular: 0x000000ff,
  }),
]);

const specularPanel = createMesh(geometry, [
  createBlinnPhongMaterial({
    diffuse: 0x282828ff,
    shininess: 16,
    specular: 0xffffffff,
    specularMap: createStripTexture(0x000000ff, 0xffffffff, true),
  }),
]);
specularPanel.position.x = 2;
invalidateNodeLocalTransform(specularPanel);

const scene = createScene3D().root;
addNodeChild(scene, diffusePanel);
addNodeChild(scene, normalPanel);
addNodeChild(scene, specularPanel);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 800 / 600, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 7), createVector3(0, 0, 0), createVector3(0, 1, 0));

const direction = createVector3(-0.75, 0, -0.66);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 2.2 }),
});

function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const sampleRgb = (x: number): number => getBitmapPixelRgb(bitmap, Math.floor(bitmap.width * x), bitmap.height >> 1);
  const sampleLuminance = (x: number): number =>
    getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * x), bitmap.height >> 1);

  const diffuseLeft = sampleRgb(0.2);
  const diffuseRight = sampleRgb(0.29);
  if ((diffuseLeft >>> 16) - (diffuseLeft & 0xff) < 60 || (diffuseRight & 0xff) - (diffuseRight >>> 16) < 60) {
    throw new Error('[material-blinn-phong-maps] diffuse-map red/blue halves are missing or reversed');
  }

  const normalLeft = sampleLuminance(0.45);
  const normalRight = sampleLuminance(0.55);
  if (normalLeft <= normalRight + 35) {
    throw new Error(
      `[material-blinn-phong-maps] normal-map halves did not separate (left ${normalLeft}, right ${normalRight})`,
    );
  }

  const specularLeft = sampleLuminance(0.71);
  const specularRight = sampleLuminance(0.8);
  if (specularRight <= specularLeft + 35) {
    throw new Error(
      `[material-blinn-phong-maps] specular-map halves did not separate (left ${specularLeft}, right ${specularRight})`,
    );
  }
  // Edge guard for the diffuse panel. Every sample above sits well inside a panel, so none of them
  // noticed when this scene's panels were thin BOXES and each off-centre one drew its inward side face —
  // a ~2px strip replaying the whole map — just inside its edge.
  //
  // It has to be a WINDOW, not a sample. The strip sat inside the outermost covered pixel (blue, red,
  // red, blue going in), so a single read at the edge, or three pixels in, landed on the correct half
  // and passed. Only requiring the blue half to hold across the last few pixels catches it.
  //
  // The specular panel gets no such guard on purpose: its side face rendered at luminance 8, DARKER than
  // the 11 of the background, so a coverage walk stops before reaching it and cannot see it at all.
  let edgeX = Math.floor(bitmap.width * 0.29);
  while (edgeX < bitmap.width - 1 && getBitmapPixelLuminance(bitmap, edgeX + 1, bitmap.height >> 1) > 25) {
    edgeX++;
  }
  for (let i = 0; i < 4; i++) {
    const rgb = getBitmapPixelRgb(bitmap, edgeX - i, bitmap.height >> 1);
    if ((rgb & 0xff) - (rgb >>> 16) < 60) {
      throw new Error(
        `[material-blinn-phong-maps] the diffuse panel is not blue ${i}px inside its right edge (#${(rgb & 0xffffff).toString(16).padStart(6, '0')}) — something is drawn over the edge of the map`,
      );
    }
  }
}
