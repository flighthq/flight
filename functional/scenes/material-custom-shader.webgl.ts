import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Camera3D, GlRenderEffectPipeline, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginGlRenderEffectPipeline,
  createCamera3D,
  createCustomShaderMaterial,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createPerspectiveProjection,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getBitmapPixelRgb,
  prepareScene3DRender,
  registerGlCustomShaderMaterial,
  registerGlCustomMaterialShader,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';

declareExpectedImageDescription(
  'An 800x600 field on a near-black background with a single mesh centred in it, coloured by a ' +
    'hand-written shader rather than by any built-in material, so its surface is clearly not blank and ' +
    'not the background colour. The BACKGROUND ITSELF is the second claim: it stays the same near-black ' +
    'it was cleared to, neither lifted nor washed out — a visibly lighter or greyer field around the ' +
    'mesh means the frame was gamma-shifted on its way to the screen, which is the failure this watches ' +
    'for alongside a blank mesh.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlCustomShaderMaterial(state);
registerGlCustomMaterialShader(state, 'normal-tint', {
  vertex: `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
uniform mat4 u_viewProjection;
uniform mat4 u_model;
uniform mat3 u_normalMatrix;
out vec3 v_worldNormal;
void main() {
  v_worldNormal = normalize(u_normalMatrix * a_normal);
  gl_Position = u_viewProjection * u_model * vec4(a_position, 1.0);
}`,
  fragment: `#version 300 es
precision highp float;
in vec3 v_worldNormal;
uniform float alpha;
uniform float blue;
uniform float green;
uniform float red;
out vec4 outColor;
void main() {
  vec3 normalColor = abs(normalize(v_worldNormal)) * 0.45;
  outColor = vec4(normalColor + vec3(red, green, blue), alpha);
}`,
});

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
  state.gl.depthMask(true);
  state.gl.clearDepth(1);
  state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// The same CustomShaderMaterial instance shape is consumed by both backend scenes. Deliberately reverse
// the uniform bag: GL resolves by name, while WGPU must sort it into UserBlock's alphabetical field order.
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
