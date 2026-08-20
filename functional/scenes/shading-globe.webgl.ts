import { createScene3D } from '@flighthq/scene3d';
import {
  drawGlScene3D,
  registerBuiltInGlModifierSnippets,
  registerGlShadedMaterial,
  setGlScene3DTime,
} from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  createAmbientLight,
  createAnimatedNormalModifier,
  createCamera3D,
  createDirectionalLight,
  createEmissiveModifier,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createRimModifier,
  createScene3DLights,
  createShadedMaterial,
  createSphereMeshGeometry,
  createTexture,
  createVector2,
  createVector3,
  EmissiveModifierFacing,
  beginGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'On an 800×600 almost-black navy field (about R5 G7 B12), a single large circular blue globe is ' +
    'centred near (400,300). Its screen-right day hemisphere is brightly lit; the screen-left night ' +
    'hemisphere remains visible and contains scattered warm yellow city-light clusters instead of ' +
    'falling to black. Subtle normal-map variation breaks up the blue surface, and a cool cyan ' +
    'atmospheric rim is strongest near the silhouette. The globe stays circular and bounded, with no ' +
    'second sphere, flat unshaded disk or city lights on the surrounding field.',
);

// drawGlScene3D / setGlScene3DTime / the ShadedMaterial registrations exist only on scene-gl; drawGlScene3D
// also collides in the @flighthq/sdk barrel (re-exported from scene-wgpu too), so the whole shading-GL
// group is imported directly from @flighthq/scene3d-gl.

// shading-globe — the end-to-end proof of the @flighthq/shading Modifier tier: ONE ShadedMaterial on
// one sphere stacking all three v1 seed modifiers across three slots, assembled by scene-gl into a
// single program over the shared light block. This re-expresses the AwayJS "globe material" as a
// COMPOSITION of reusable modifiers rather than a bespoke class:
//   - AnimatedNormalModifier (Normal slot)   — a UV-panned ocean normal scrolled by the per-frame
//                                               `time` uniform (setGlScene3DTime).
//   - EmissiveModifier (Emissive slot)        — night-side city lights: a mask texture gated by
//                                               EmissiveModifierFacing.AwayFromLight so it only lights
//                                               the hemisphere turned away from the sun.
//   - RimModifier (Effect slot)               — the atmospheric Fresnel halo at grazing angles.
//
// Gl forward-lit 3D column, mirroring the material-* scenes: the ShadedMaterial renderer writes linear
// HDR into the effect pipeline's rgba16f + depth scene target (depth-test ON so the sphere occludes
// itself), then ends with an empty effect list to tone-present the HDR scene straight to the canvas.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x05070cff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardGlTextureResolvers(state);
registerGlShadedMaterial(state);
registerBuiltInGlModifierSnippets(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// A fixed per-frame time so the scrolling AnimatedNormalModifier samples a deterministic UV offset for
// a reproducible capture — the seam is setGlScene3DTime; an app would advance it with elapsed seconds.
const sceneTimeSeconds = 0.35;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  setGlScene3DTime(state, sceneTimeSeconds);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// A smooth unit sphere — the globe. Many segments so the modifier contributions read cleanly.
const geometry = createSphereMeshGeometry(0.9, 64, 48);

// The composable base owned by @flighthq/shading, carrying the ordered three-modifier stack. The
// compile path groups the stack by slot and assembles one program keyed by its define-key.
const material = createShadedMaterial({
  diffuse: 0x1a3a6aff,
  specular: 0x223344ff,
  shininess: 24,
  modifiers: [
    createAnimatedNormalModifier({
      map: createTexture({
        colorSpace: 'linear',
        dimension: '2d',
        source: createImageResourceFromCanvas(oceanNormalCanvas()),
      }),
      scroll: createVector2(0.05, 0.02),
      strength: 0.6,
    }),
    createEmissiveModifier({
      color: 0xffd27fff,
      strength: 3,
      mask: createTexture({
        colorSpace: 'linear',
        dimension: '2d',
        source: createImageResourceFromCanvas(cityLightsCanvas()),
      }),
      facing: EmissiveModifierFacing.AwayFromLight,
      facingSoftness: 0.25,
    }),
    createRimModifier({ color: 0x4aa6ffff, power: 3, intensity: 1.6 }),
  ],
});

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Perspective camera dead-on the globe from +z. Aspect matches the target so the globe stays circular.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3.2), createVector3(0, 0, 0), createVector3(0, 1, 0));

// One white sun travelling down-left-into-screen, so the screen-RIGHT hemisphere is the lit day side
// and the screen-LEFT hemisphere is the dark night side where the facing-gated city lights emit. A dim
// cool ambient fill keeps the night side from crushing fully to black before the emissive adds in.
const sunDirection = createVector3(-1, -0.25, -0.5);
normalizeVector3(sunDirection, sunDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x35406aff, intensity: 0.12 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: sunDirection, intensity: 3 }),
});

render(scene, camera, lights);

// Assertion: the globe renders lit AND the facing-gated emissive fires on the night side. The sun faces
// the screen-right hemisphere, so a screen-right pixel is the lit day side (base shading, bright) and a
// screen-left pixel is the night side — dark under lighting alone, but lifted by the AwayFromLight
// EmissiveModifier's city lights. Both being clearly non-black is the signature that the base shading
// AND the emissive modifier both contributed (a plain lit material would leave the night side near the
// dim ambient floor). This is a shape/behaviour check, not a visual-parity assertion.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.06);

  const dayLuminance = getBitmapPixelLuminance(bitmap, cx + offset, cy);
  const nightLuminance = getBitmapPixelLuminance(bitmap, cx - offset, cy);

  if (dayLuminance <= 24) {
    throw new Error(`[shading-globe] day side is blank (luminance ${dayLuminance}) — globe did not render`);
  }
  if (nightLuminance <= 16) {
    throw new Error(
      `[shading-globe] night side is dark (luminance ${nightLuminance}) — the facing-gated EmissiveModifier did not contribute`,
    );
  }
}

// A tangent-space normal map for the ocean: a flat blue base (0.5, 0.5, 1.0 → +z) perturbed by a few
// brighter/darker ripples so the AnimatedNormalModifier's scrolled sample visibly bends the normal.
function oceanNormalCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8080ff';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 24; i++) {
    const x = (i * 37) % 64;
    const y = (i * 53) % 64;
    ctx.fillStyle = i % 2 === 0 ? '#a090ff' : '#6070ff';
    ctx.fillRect(x, y, 6, 6);
  }
  return canvas;
}

// The city-lights mask: dark almost everywhere with scattered bright clusters standing in for cities.
// The EmissiveModifier multiplies its emissive colour by this mask's rgb, so only the bright cells emit.
function cityLightsCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    const x = (i * 29 + 7) % 64;
    const y = (i * 47 + 3) % 64;
    ctx.fillRect(x, y, 3, 3);
  }
  return canvas;
}
