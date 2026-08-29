import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuEnvironmentSkybox, drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Environment, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createCubeTexture,
  createDirectionalLight,
  createEnvironment,
  createImageResourceFromCanvas,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createStandardPbrMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  getBitmapPixel,
  prepareScene3DRender,
  registerWgpuStandardPbrMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setCubeTextureFace,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

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
    'uniform fill, which would mean the per-ray reconstruction collapsed. Source does not determine how sharp the ' +
    'boundaries between faces are; it depends on the texture filtering the runtime applies, which no scene file ' +
    'sets. The scene configures each cube face as an 8x8 solid-colour canvas and sets no filtering parameters at ' +
    'all — no minFilter, no magFilter, no seamless flag anywhere in the scene file — so whether a transition ' +
    'renders as a hard edge or as a blend depends on the default texture filter mode and on whether ' +
    'GL_TEXTURE_CUBE_MAP_SEAMLESS (or the WebGPU sampler equivalent) is enabled. Neither is a scene-file ' +
    'parameter; both are texture and rendering-infrastructure defaults invisible from source. Source alone ' +
    'therefore cannot determine this, so this description claims the ORDER and the DOMINANT face only: it ' +
    'predicts neither a sharp boundary at exactly 55 px nor any particular blend width. In front of the backdrop ' +
    'sits a single matte grey sphere (baseColor 0x808080, metallic 0, roughness 0.5), horizontally centred but ' +
    'sitting ABOVE the centre of the field because the camera is tilted down by b = 5.71 deg: its centre is at ' +
    '(0.5*W, 0.5*H - H*tan(b)/(2*tan(t))) = (0.5*W, 0.4423*H) = (400, 265.4). Writing a = asin(0.8/4) = 11.54 deg ' +
    'for its angular radius, it measures H*(tan(b+a) - tan(b-a))/(2*tan(t)) = 0.2380*H = 142.8 px vertically and ' +
    'W*tan(a)/((W/H)*tan(t)) = 0.1767*W = 141.3 px horizontally — a circle to the eye, about 142 px across. It is ' +
    'lit from above and slightly from the right by one directional light travelling along (-0.4,-1,-0.3), so its ' +
    'upper surface is clearly brighter than its lower — and it carries NO mirror-like reflection of the cube ' +
    'around it, because nothing feeds the environment into the material: it is a rough, ordinary grey ball in ' +
    'front of a coloured backdrop.',
);
// WebGPU mirror of env-skybox.webgl: distinct procedural cube faces must vary across reconstructed
// view rays rather than collapsing to a flat backdrop.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderStateFromCanvasElement(canvas, { pixelRatio, backgroundColor: 0x0a0c10ff });
registerWgpuStandardPbrMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
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
  renderWgpuBackground(state);
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  drawWgpuEnvironmentSkybox(state, environment, camera, width / height);
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const colors = ['#ff3030', '#30ff30', '#f0f0f0', '#303030', '#3030ff', '#ffe030'];
const cube = createCubeTexture();
for (let face = 0; face < colors.length; face++) {
  setCubeTextureFace(cube, face, createImageResourceFromCanvas(solidFaceCanvas(colors[face])));
}
const environment = createEnvironment({ environment: cube, intensity: 1 });
const scene = createScene3D().root;
addNodeChild(
  scene,
  createMesh(createSphereMeshGeometry(0.8, 32, 24), [
    createStandardPbrMaterial({ baseColor: 0x808080ff, metallic: 0, roughness: 0.5 }),
  ]),
);
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 2.2 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, -0.4, 0), createVector3(0, 1, 0));
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x808080ff, intensity: 0.5 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(-0.4, -1, -0.3), intensity: 1.5 }),
});
render(scene, camera, lights, environment);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const top = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.5), Math.floor(bitmap.height * 0.12));
  const left = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.08), Math.floor(bitmap.height * 0.5));
  const right = getBitmapPixel(bitmap, Math.floor(bitmap.width * 0.92), Math.floor(bitmap.height * 0.5));
  if (blank(top) && blank(left) && blank(right)) throw new Error('[env-skybox] backdrop is blank');
  if (sameColor(top, left) && sameColor(left, right)) throw new Error('[env-skybox] backdrop is uniform');
}

function solidFaceCanvas(color: string): HTMLCanvasElement {
  const face = document.createElement('canvas');
  face.width = 8;
  face.height = 8;
  const context = face.getContext('2d')!;
  context.fillStyle = color;
  context.fillRect(0, 0, 8, 8);
  return face;
}

function channel(pixel: number, shift: number): number {
  return (pixel >>> shift) & 0xff;
}
function blank(pixel: number): boolean {
  return channel(pixel, 24) < 24 && channel(pixel, 16) < 24 && channel(pixel, 8) < 24;
}
function sameColor(a: number, b: number): boolean {
  return (
    Math.abs(channel(a, 24) - channel(b, 24)) < 24 &&
    Math.abs(channel(a, 16) - channel(b, 16)) < 24 &&
    Math.abs(channel(a, 8) - channel(b, 8)) < 24
  );
}
