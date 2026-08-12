import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, GlRenderEffectPipeline, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createCamera3D,
  createDepthMaterial,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createScene3DLights,
  createSphereMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerGlDepthMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// Orthographic regression for DepthMaterial's linear view-axis depth. A perspective camera makes
// clip-space w equal positive eye depth, which lets an illicit `1 / gl_FragCoord.w` implementation
// look correct. Orthographic clip w is constant, so only a real world->view transform preserves the
// sphere's center-to-silhouette depth gradient.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  backgroundColor: 0x081020ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio,
});
registerGlDepthMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 4,
});

export const height = 600;
export const scale = pixelRatio;
export const width = 800;

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

const scene = createScene3D().root;
const geometry = createSphereMeshGeometry(0.7, 64, 40);
const material = createDepthMaterial({ far: 3.5, near: 0 });
addNodeChild(scene, createMesh(geometry, [material]));

const halfHeight = 1.2;
const halfWidth = halfHeight * (width / height);
const camera = createCamera3D({
  far: 20,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight, halfWidth }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

render(scene, camera, createScene3DLights());

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const centerX = Math.floor(bitmap.width / 2);
  const centerY = Math.floor(bitmap.height / 2);
  const pixelsPerWorldUnit = bitmap.width / (halfWidth * 2);
  const outerX = centerX + Math.round(0.6 * pixelsPerWorldUnit);
  const center = getBitmapPixelLuminance(bitmap, centerX, centerY);
  const outer = getBitmapPixelLuminance(bitmap, outerX, centerY);

  if (center <= 24 || outer <= 24) {
    throw new Error(
      `[material-depth-orthographic] sphere is blank (center ${center}, outer ${outer}) — depth mesh did not render`,
    );
  }
  if (outer - center <= 8) {
    throw new Error(
      `[material-depth-orthographic] no orthographic depth gradient (center ${center}, outer ${outer}) — clip w appears to be used as eye depth`,
    );
  }
}
