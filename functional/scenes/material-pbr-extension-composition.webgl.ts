import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { bakeGlEnvironmentIbl, drawGlScene3D } from '@flighthq/scene3d-gl';
import type {
  Bitmap,
  Camera3D,
  Environment,
  GlRenderEffectPipeline,
  Node3D,
  Scene3DLights,
  VertexAttributeLayout,
} from '@flighthq/sdk';
import {
  ImageChannel,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAnisotropyPbrExtension,
  createCamera3D,
  createClearcoatPbrExtension,
  createCubeTexture,
  createDirectionalLight,
  createEnvironment,
  createExtendedPbrMaterial,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createSampler,
  createScene3DLights,
  createSheenPbrExtension,
  createStandardPbrMaterialProperties,
  createTexture,
  createVector2,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelChannel,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerGlAnisotropyPbrExtension,
  registerGlClearcoatPbrExtension,
  registerGlExtendedPbrMaterial,
  registerGlSheenPbrExtension,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  scene2DGlPipeline,
  setCamera3DViewMatrix4FromLookAt,
  setCubeTextureFace,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 near-black field containing one large camera-facing rectangular material panel. The panel combines ' +
    'a cool blue environment reflection with a warm upper-right directional highlight. Its colored cloth sheen and ' +
    'narrow clearcoat-normal stripes form eight alternating blue/purple vertical columns, while an independent UV1 ' +
    'roughness map introduces four horizontal bright/soft bands. The glossy coat does not erase the underlying grid. ' +
    'A flat panel, one-axis-only bands, or a black panel fails.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2DGlPipeline,
  { backgroundColor: 0x080b12ff, pixelRatio },
);
registerStandardGlTextureResolvers(state);
registerGlAnisotropyPbrExtension(state);
registerGlClearcoatPbrExtension(state);
registerGlSheenPbrExtension(state);
registerGlExtendedPbrMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

let baked = false;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  environment: Readonly<Environment>,
): void {
  if (!baked) {
    bakeGlEnvironmentIbl(state, environment);
    baked = true;
  }
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

// The extension maps deliberately disagree. UV0 runs left-to-right; UV1.x runs bottom-to-top.
// Both sampled maps also tile twice, so losing either the selected UV set or that map's transform
// turns the two-dimensional band grid into a visibly different one-axis pattern.
const extensionLayout: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
    { byteOffset: 48, format: 'float32x2', semantic: 'uv1' },
  ],
  stride: 56,
};

// prettier-ignore
const panelVertices = new Float32Array([
  // position          normal     tangent      uv0    uv1 (x follows screen y)
  -1.25, -0.85, 0,   0, 0, 1,   1, 0, 0, 1,   0, 0,  0, 0,
   1.25, -0.85, 0,   0, 0, 1,   1, 0, 0, 1,   1, 0,  0, 1,
   1.25,  0.85, 0,   0, 0, 1,   1, 0, 0, 1,   1, 1,  1, 1,
  -1.25,  0.85, 0,   0, 0, 1,   1, 0, 0, 1,   0, 1,  1, 0,
]);
const geometry = createMeshGeometry({
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  layout: extensionLayout,
  vertices: panelVertices,
});

const nearestRepeat = createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
  mipmaps: false,
  wrapU: 'repeat',
  wrapV: 'repeat',
});
const mapScale = createVector2(2, 1);
const mapOffset = createVector2(0.125, 0);
const sheenColorMap = createTexture({
  source: createImageResourceFromCanvas(twoColorCanvas('#ff1838', '#10d8ff')),
  sampler: nearestRepeat,
  uvOffset: mapOffset,
  uvScale: mapScale,
});
const sheenRoughnessMap = createTexture({
  colorSpace: 'linear',
  source: createImageResourceFromCanvas(twoColorCanvas('rgba(255,255,255,0.12)', 'rgba(255,255,255,1)')),
  sampler: nearestRepeat,
  uvOffset: createVector2(0.375, 0),
  uvScale: mapScale,
});
const clearcoatNormalMap = createTexture({
  colorSpace: 'linear',
  source: createImageResourceFromCanvas(twoColorCanvas('rgb(214,128,224)', 'rgb(42,128,224)')),
  sampler: nearestRepeat,
  uvOffset: createVector2(0.0625, 0),
  uvScale: createVector2(4, 1),
});

const material = createExtendedPbrMaterial({
  extensions: [
    createAnisotropyPbrExtension({ anisotropyRotation: 0.35, anisotropyStrength: 0.8 }),
    createClearcoatPbrExtension({
      clearcoat: 1,
      clearcoatNormalMap,
      clearcoatNormalMapUvSet: 0,
      clearcoatNormalScale: 0.45,
      clearcoatRoughness: 0.14,
    }),
    createSheenPbrExtension({
      sheenColor: 0xffffffff,
      sheenColorMap,
      sheenColorMapUvSet: 0,
      sheenRoughness: 0.85,
      sheenRoughnessMap,
      sheenRoughnessMapUvSet: 1,
    }),
  ],
  standard: createStandardPbrMaterialProperties({ baseColor: 0x18202cff, metallic: 0.15, roughness: 0.48 }),
});

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const direction = createVector3(-0.7, -0.45, -1);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: null,
  directional: createDirectionalLight({ color: 0xffd0a0ff, direction, intensity: 2.2 }),
});

const cube = createCubeTexture();
for (let face = 0; face < 6; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidCanvas('#3658ff')));
}
const environment = createEnvironment({ environment: cube, intensity: 0.65 });

render(scene, camera, lights, environment);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const centerX = Math.floor(bitmap.width * 0.5);
  const centerY = Math.floor(bitmap.height * 0.5);
  // These points are one quarter of the panel apart: they select opposite color-map texels while
  // landing on the same phase of the twice-as-frequent clearcoat-normal pattern.
  const leftX = Math.floor(bitmap.width * 0.26);
  const rightX = Math.floor(bitmap.width * 0.45);
  const upperY = Math.floor(bitmap.height * 0.4);
  const lowerY = Math.floor(bitmap.height * 0.57);
  const centerLuminance = getBitmapPixelLuminance(bitmap, centerX, centerY);
  if (centerLuminance <= 24) {
    throw new Error(`[material-pbr-extension-composition] panel is blank (luminance ${centerLuminance})`);
  }

  const leftRed = getBitmapPixelChannel(bitmap, leftX, centerY, ImageChannel.Red);
  const leftBlue = getBitmapPixelChannel(bitmap, leftX, centerY, ImageChannel.Blue);
  const rightRed = getBitmapPixelChannel(bitmap, rightX, centerY, ImageChannel.Red);
  const rightBlue = getBitmapPixelChannel(bitmap, rightX, centerY, ImageChannel.Blue);
  if (Math.abs(leftRed - rightRed) < 24 && Math.abs(leftBlue - rightBlue) < 24) {
    throw new Error(
      `[material-pbr-extension-composition] UV0 color-map bands are missing (${leftRed}/${leftBlue} vs ${rightRed}/${rightBlue})`,
    );
  }

  const upperLuminance = getBitmapPixelLuminance(bitmap, centerX, upperY);
  const lowerLuminance = getBitmapPixelLuminance(bitmap, centerX, lowerY);
  if (Math.abs(upperLuminance - lowerLuminance) < 12) {
    throw new Error(
      `[material-pbr-extension-composition] UV1 roughness bands are missing (${upperLuminance} vs ${lowerLuminance})`,
    );
  }
}

function twoColorCanvas(left: string, right: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 1;
  const context = canvas.getContext('2d')!;
  context.fillStyle = left;
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = right;
  context.fillRect(1, 0, 1, 1);
  return canvas;
}

function solidCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 8, 8);
  return canvas;
}
