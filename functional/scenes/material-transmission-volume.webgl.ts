import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderPass,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createExtendedPbrMaterial,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createGlRenderTarget,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterialProperties,
  createTransmissionVolumePbrExtension,
  createUnlitMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  endGlRenderPass,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerGlTransmissionVolumePbrExtension,
  registerGlUnlitMaterial,
  registerGlExtendedPbrMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setGlPbrTransmissionSceneColor,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x0a0c10) with a translucent sphere centered at (0.5*W, 0.5*H) = (400, 300), tangent-silhouette radius H*tan(asin(0.5/3))/(2*tan(PI/8)) ≈ 122 px (spanning x 278–522, y 178–422), over a backdrop of five vertical color stripes (red, cyan, yellow, purple, green) placed behind the sphere. The sphere refracts and tints the striped backdrop through its volume — the stripes are visible through the sphere but distorted and color-shifted by a blue attenuation. The sphere base color is mid-gray (0x808080). Frame corners are dark background.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlTransmissionVolumePbrExtension(state);
registerGlExtendedPbrMaterial(state);
registerGlUnlitMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});
const opaqueSceneTarget = createGlRenderTarget(state, {
  colorSpace: 'linear',
  depth: 'depth-stencil',
  format: 'rgba8',
  height: canvas.height,
  sampleCount: 1,
  width: canvas.width,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  setGlPbrTransmissionSceneColor(state, null);
  beginGlRenderPass(state, opaqueSceneTarget);
  renderGlBackground(state);
  prepareScene3DRender(state, opaqueScene, camera, lights);
  drawGlScene3D(state, opaqueScene, camera, lights);
  endGlRenderPass(state);

  const gl = state.gl;
  gl.bindTexture(gl.TEXTURE_2D, opaqueSceneTarget.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  setGlPbrTransmissionSceneColor(state, {
    height: opaqueSceneTarget.height,
    mipLevelCount: Math.floor(Math.log2(Math.max(opaqueSceneTarget.width, opaqueSceneTarget.height))) + 1,
    texture: opaqueSceneTarget.texture,
    width: opaqueSceneTarget.width,
  });

  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// material-transmission-volume proves explicit opaque capture/resolve, projected refraction,
// roughness-filtered sampling, and Beer-Lambert absorption against a striped background.
// createScene3D exists on both @flighthq/node and @flighthq/scene3d, so it collides in the @flighthq/sdk
// barrel (conflicting star exports) and is unavailable there — import the 3D scene one directly. The
// Mesh added to it is a @flighthq/scene3d Node3D, so this is the type-correct source too.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere at the origin. Many segments so the shading gradient is clean, not faceted.
const geometry = createSphereMeshGeometry(0.5, 48, 32);

// Mid-gray dielectric base (metallic 0, roughness ~0.5) gives a broad diffuse falloff that reads
// clearly as a light/dark gradient across the sphere, with the extension factors set strongly active.
const material = createExtendedPbrMaterial({
  extensions: [
    createTransmissionVolumePbrExtension({
      attenuationColor: 0x80c0ffff,
      ior: 1.5,
      thickness: 1,
      transmission: 1,
    }),
  ],
  standard: createStandardPbrMaterialProperties({ baseColor: 0x808080ff, metallic: 0, roughness: 0.5 }),
});

const scene = createScene3D().root;
const opaqueScene = createScene3D().root;
addBackdrop(scene);
addBackdrop(opaqueScene);
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

function addBackdrop(target: Node3D): void {
  const colors = [0xf43f5eff, 0x22d3eeff, 0xfacc15ff, 0x8b5cf6ff, 0x34d399ff];
  for (let i = 0; i < colors.length; i++) {
    const stripe = createMesh(createBoxMeshGeometry(0.75, 3.2, 0.05), [createUnlitMaterial({ baseColor: colors[i] })]);
    stripe.position.x = (i - 2) * 0.75;
    stripe.position.z = -1.2;
    invalidateNodeLocalTransform(stripe);
    addNodeChild(target, stripe);
  }
}

// Perspective camera dead-on the sphere from +z, looking at the origin. The aspect must match the
// target so the sphere stays circular (prepareScene3DRender reads aspect off the projection).
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white sun + a dim cool ambient fill. The sun travels down-left-into-screen, so the +x / +y / +z
// (screen up-right, toward camera) hemisphere is lit and the opposite hemisphere is shadowed.
const directionalDirection = createVector3(-1, -0.35, -0.55);
normalizeVector3(directionalDirection, directionalDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const transmitted = getBitmapPixelRgb(bitmap, cx, cy);
  const unobstructed = getBitmapPixelRgb(bitmap, cx, Math.floor(bitmap.height * 0.25));
  if (transmitted === unobstructed) {
    throw new Error(
      `[material-transmission-volume] center transmission pixel (${transmitted.toString(16)}) matches the unobstructed background — refraction/absorption did not contribute`,
    );
  }
}
