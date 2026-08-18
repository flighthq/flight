import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createCamera3D,
  createCustomShaderMaterial,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  prepareScene3DRender,
  registerWgpuCustomShaderMaterial,
  registerWgpuCustomMaterialShader,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single mesh centred in it, coloured by a ' +
    'hand-written shader rather than by any built-in material, so its surface is clearly not blank and ' +
    'not the background colour. The BACKGROUND ITSELF is the second claim: it stays the same near-black ' +
    'it was cleared to, neither lifted nor washed out — a visibly lighter or greyer field around the ' +
    'mesh means the frame was gamma-shifted on its way to the screen, which is the failure this watches ' +
    'for alongside a blank mesh.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuCustomShaderMaterial(state);
registerWgpuCustomMaterialShader(
  state,
  'normal-tint',
  `
struct Frame {
  viewProjection : mat4x4f,
};
struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
};
// UserBlock fields MUST follow alphabetical uniform-name order. Each logical value consumes vec4f.
struct UserBlock {
  alpha : vec4f,
  blue : vec4f,
  green : vec4f,
  red : vec4f,
};
@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;
@group(2) @binding(0) var<uniform> user : UserBlock;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldNormal : vec3f,
};
@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
) -> VertexOutput {
  var out : VertexOutput;
  out.clipPosition = frame.viewProjection * draw.world * vec4f(position, 1.0);
  out.worldNormal = normalize(draw.normalMatrix * normal);
  return out;
}
@fragment fn fs_main(input : VertexOutput) -> @location(0) vec4f {
  let normalColor = abs(normalize(input.worldNormal)) * 0.45;
  return vec4f(normalColor + vec3f(user.red.x, user.green.x, user.blue.x), user.alpha.x);
}
`,
);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  renderWgpuBackground(state);
  // Custom mesh shaders produce the same linear scene color as built-in 3D materials. Declare that
  // before the pass opens so its packed sRGB background is decoded before the linear present encodes it.
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

const material = createCustomShaderMaterial({
  shaderKey: 'normal-tint',
  uniforms: { red: 0.08, green: 0.16, blue: 0.3, alpha: 1 },
});
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createSphereMeshGeometry(0.5, 48, 32), [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({
    aspect: width / height,
    fovY: Math.PI / 4,
  }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(), createVector3(0, 1, 0));
render(scene, camera, createScene3DLights({ ambient: null, directional: null }));

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const cx = Math.floor(bitmap.width / 2);
  const cy = Math.floor(bitmap.height / 2);
  const background = getBitmapPixelLuminance(bitmap, 0, 0);
  const center = getBitmapPixelLuminance(bitmap, cx, cy);
  const centerRgb = getBitmapPixelRgb(bitmap, cx, cy);
  const edgeRgb = getBitmapPixelRgb(bitmap, cx + Math.floor(bitmap.width * 0.07), cy);
  if (background >= 24) {
    throw new Error(`[material-custom-shader] linear target gamma-lifted the sRGB background (${background})`);
  }
  if (center <= 24) throw new Error(`[material-custom-shader] blank custom material (${center})`);
  if (centerRgb === edgeRgb) {
    throw new Error('[material-custom-shader] custom normal-matrix shading did not vary across the sphere');
  }
}
