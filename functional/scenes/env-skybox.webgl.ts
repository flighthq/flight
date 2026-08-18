import { createScene3D } from '@flighthq/scene3d';
import { drawGlEnvironmentSkybox, drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, Environment, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createCubeTexture,
  createDirectionalLight,
  createEnvironment,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixel,
  prepareScene3DRender,
  registerGlStandardPbrMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setCubeTextureFace,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field whose entire backdrop is the inside of a six-colour environment cube, with a matte grey ' +
    'sphere in front of it. The backdrop is DOMINATED BY THE YELLOW -Z FACE (0xffe030): the camera sits at ' +
    '(0,0,4) looking at (0,-0.4,0) with a wide fovY of pi/2.2, so -Z is the dominant axis of the view ray over ' +
    'the great majority of the field, and the green -X face (0x30ff30) and the red +X face (0xff3030) take over ' +
    'only past the points where |x| = |z| on the ray, at 0.5*(1 - cos(b)/((W/H)*tan(t))) = 0.0694*W = 55 px in ' +
    'from the left edge and the same distance in from the right, writing b = atan(0.4/4) for the downward tilt of ' +
    'the optical axis and t = fovY/2 = pi/4.4. Top and bottom stay yellow at the sampled heights: the near-white ' +
    '+Y and dark-grey -Y faces are much further from dominance vertically than the side faces are horizontally. ' +
    'So the picture reads left to right as green, then a broad yellow field across the middle, then red — NOT a ' +
    'uniform fill, which would mean the per-ray reconstruction collapsed. BOUNDED, and the reason is that the ' +
    'derivation runs out here: the boundary sharpness is INDETERMINATE FROM SOURCE. The scene configures each ' +
    'cube face as an 8x8 solid-colour canvas and sets no filtering parameters at all — no minFilter, no ' +
    'magFilter, no seamless flag anywhere in the scene file — so whether a transition renders as a hard edge or ' +
    'as a blend depends on the default texture filter mode and on whether GL_TEXTURE_CUBE_MAP_SEAMLESS (or the ' +
    'WebGPU sampler equivalent) is enabled. Neither is a scene-file parameter; both are texture and ' +
    'rendering-infrastructure defaults invisible from source. Source alone therefore cannot determine this, so ' +
    'this description claims the ORDER and the DOMINANT face only: it predicts neither a sharp boundary at ' +
    'exactly 55 px nor any particular blend width. In front of the backdrop sits a single matte grey sphere ' +
    '(baseColor 0x808080, metallic 0, roughness 0.5), horizontally centred but sitting ABOVE the centre of the ' +
    'field because the camera is tilted down by b = 5.71 deg: its centre is at (0.5*W, 0.5*H - ' +
    'H*tan(b)/(2*tan(t))) = (0.5*W, 0.4423*H) = (400, 265.4). Writing a = asin(0.8/4) = 11.54 deg for its angular ' +
    'radius, it measures H*(tan(b+a) - tan(b-a))/(2*tan(t)) = 0.2380*H = 142.8 px vertically and ' +
    'W*tan(a)/((W/H)*tan(t)) = 0.1767*W = 141.3 px horizontally — a circle to the eye, about 142 px across. It is ' +
    'lit from above and slightly from the right by one directional light travelling along (-0.4,-1,-0.3), so its ' +
    'upper surface is clearly brighter than its lower — and it carries NO mirror-like reflection of the cube ' +
    'around it, because nothing feeds the environment into the material: it is a rough, ordinary grey ball in ' +
    'front of a coloured backdrop.',
);
// drawGlEnvironmentSkybox + drawGlScene3D collide with the wgpu backend in the @flighthq/sdk barrel, so
// import the Gl scene functions directly. The skybox draws the environment cubemap as the backdrop
// (depth off) before the scene draws over it.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlStandardPbrMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(
  scene: Readonly<Node3D>,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLights>,
  environment: Readonly<Environment>,
): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);

  // Backdrop: the environment cubemap, behind everything (the pass writes no depth).
  drawGlEnvironmentSkybox(state, environment, camera, width / height);

  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// env-skybox — proves the environment skybox recipe on the Gl backend: a radiance cubemap with six
// distinct face colors drawn as the scene backdrop, with a sphere in front to confirm the skybox sits
// behind opaque geometry (depth ordering). The cube faces are generated procedurally (solid-color
// canvases) so the test needs no image assets. drawGlEnvironmentSkybox reconstructs each pixel's world
// ray from the inverse view-projection and samples the cube, so different screen regions show
// different faces — the assertion checks for face variation plus a non-blank backdrop.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

// Six solid-color faces in canonical +X, -X, +Y, -Y, +Z, -Z order — each visually distinct so the
// sampling can tell which face a view ray landed on.
const FACE_COLORS: readonly string[] = [
  '#ff3030', // +X right  — red
  '#30ff30', // -X left   — green
  '#f0f0f0', // +Y up     — near-white
  '#303030', // -Y down   — dark gray
  '#3030ff', // +Z front  — blue
  '#ffe030', // -Z back   — yellow
];

const cube = createCubeTexture();
for (let face = 0; face < 6; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidFaceCanvas(FACE_COLORS[face])));
}
const environment = createEnvironment({ environment: cube, intensity: 1 });

const scene = createScene3D().root;
const sphere = createMesh(createSphereMeshGeometry(0.8, 32, 24), [
  createStandardPbrMaterial({ baseColor: 0x808080ff, metallic: 0, roughness: 0.5 }),
]);
addNodeChild(scene, sphere);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 2.2 }),
});
// Look down the -Z axis, tilted slightly down, so the view spans the back face (-Z, yellow) in the
// centre with the down face (-Y, dark) toward the bottom and the up face (+Y, light) toward the top.
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, -0.4, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x808080ff, intensity: 0.5 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(-0.4, -1, -0.3), intensity: 1.5 }),
});

render(scene, camera, lights, environment);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  // Sample the backdrop above the sphere (top), and the two flanks well outside the sphere silhouette.
  const top = getBitmapPixel(bitmap, cx, Math.floor(bitmap.height * 0.12));
  const left = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.08), Math.floor(bitmap.height * 0.5));
  const right = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.92), Math.floor(bitmap.height * 0.5));

  if (isBlank(top) && isBlank(left) && isBlank(right)) {
    throw new Error('[env-skybox] backdrop is blank — skybox did not render');
  }
  // The skybox must vary across the frame (different view rays hit different faces); a single flat
  // color would mean the ray reconstruction collapsed.
  if (sameColor(top, left) && sameColor(left, right)) {
    throw new Error(
      `[env-skybox] backdrop is uniform (top=${hex(top)} left=${hex(left)} right=${hex(right)}) — cube not sampled per-ray`,
    );
  }
}

function solidFaceCanvas(color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  return canvas;
}

function isBlank(px: number): boolean {
  return red(px) < 24 && green(px) < 24 && blue(px) < 24;
}

function sameColor(a: number, b: number): boolean {
  return Math.abs(red(a) - red(b)) < 24 && Math.abs(green(a) - green(b)) < 24 && Math.abs(blue(a) - blue(b)) < 24;
}

function red(px: number): number {
  return (px >>> 24) & 0xff;
}
function green(px: number): number {
  return (px >>> 16) & 0xff;
}
function blue(px: number): number {
  return (px >>> 8) & 0xff;
}
function hex(px: number): string {
  return `#${(px >>> 8).toString(16).padStart(6, '0')}`;
}
