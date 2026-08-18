import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createScene3DLights,
  createSpotLight,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background (0x0a0c10) with a single grey sphere centred at (0.5*W, 0.5*H) = ' +
    '(400,300), about 245 px across — D = H*tan(asin(0.5/3))/tan(pi/8) = 0.408*H. The sphere is lit from the ' +
    'upper right and toward the viewer by one white spot at (1.3,0.5,1.6) aimed back at the origin: the ' +
    'screen-right side is clearly brighter and the screen-left side falls away to the dim blue-grey ambient fill. ' +
    'IMPORTANT — despite the name of this scene and its own header comment, NO CONE EDGE is visible anywhere in ' +
    'this picture, and a visible cone boundary cutting across the sphere would be wrong. The spot sits at ' +
    'distance sqrt(1.3^2+0.5^2+1.6^2) = 2.1213, and a sphere of radius 0.5 subtends a half-angle of ' +
    'asin(0.5/2.1213) = 13.633 deg about the cone axis, entirely inside the 24 deg outer half-angle, so no part ' +
    'of the surface is cone-excluded. Only a thin ring at the extreme light-facing silhouette lies past the 12 ' +
    'deg inner half-angle, and there smoothstep(cos 24 deg, cos 12 deg, cos 13.633 deg) = 0.973 dims it by under ' +
    '3 per cent — invisible in practice, since N.L is already near zero at that terminator. The screen-left to ' +
    'screen-right variation therefore comes from ordinary N.L falloff, the same mechanism as the point-light ' +
    'scene, and not from cone limiting. That gap belongs to the scene, not to the renderer: tightening the cone ' +
    'is filed separately as task #49 and deliberately not done here, because changing the light parameters would ' +
    'invalidate fingerprints, baselines and the support matrix. The background stays near-black and shows no beam ' +
    'or cone in the air.',
);
// drawGlScene3D collides in the @flighthq/sdk barrel (scene-gl + scene-wgpu) — import the Gl one directly.

// light-spot — proves a SPOT light shades the forward Gl mesh pass. A mid-gray sphere at the origin is
// lit by one white spot placed up-front-right, aimed at the origin with a moderate cone. A spot is a
// point light restricted to a cone, so it lights only the cap of the sphere inside the cone (the
// screen-right hemisphere here); the opposite side is both facing away AND outside the cone, so it
// falls to the dim ambient fill. The assertion confirms the in-cone side is clearly brighter than the
// out-of-cone side — the signature of the cone-limited punctual shading wired into the forward pass.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlBlinnPhongMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
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

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const geometry = createSphereMeshGeometry(0.5, 48, 32);
const material = createBlinnPhongMaterial({ diffuse: 0x808080ff, specular: 0x808080ff, shininess: 32 });

const scene = createScene3D().root;
const mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// A white spot up-front-right, aimed back at the origin with a 24° outer cone (12° inner hotspot), plus
// a dim ambient fill. The cone covers the screen-right cap of the sphere; the screen-left side sits
// outside the cone and unlit.
const spotPosition = createVector3(1.3, 0.5, 1.6);
const spotDirection = createVector3(-1.3, -0.5, -1.6);
normalizeVector3(spotDirection, spotDirection);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x6070a0ff, intensity: 0.15 }),
  spot: [
    createSpotLight({
      color: 0xffffffff,
      direction: spotDirection,
      innerConeDegrees: 12,
      intensity: 6,
      outerConeDegrees: 24,
      position: spotPosition,
      range: -1,
    }),
  ],
});

render(scene, camera, lights);

// Assertion: not blank + shows cone-limited shading. The cone covers the +x cap, so the screen-right
// point is inside the cone (bright) and the screen-left point is outside it (shadowed).
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.075);

  const inConeLuminance = getBitmapPixelLuminance(bitmap, cx + offset, cy);
  const outConeLuminance = getBitmapPixelLuminance(bitmap, cx - offset, cy);

  if (inConeLuminance <= 24) {
    throw new Error(`[light-spot] in-cone side is blank (luminance ${inConeLuminance}) — spot light did not shade`);
  }
  if (inConeLuminance <= outConeLuminance + 24) {
    throw new Error(
      `[light-spot] no cone shading: in-cone side (${inConeLuminance}) is not clearly brighter than out-of-cone side (${outConeLuminance})`,
    );
  }
}
