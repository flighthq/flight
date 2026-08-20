import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuFrame,
  beginWgpuRenderEffectPipeline,
  configureDirectionalShadowCamera3DTightFit,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getNode3DWorldBounds,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('aa');

declareExpectedImageDescription(
  'A top-down 800×600 view is filled edge to edge by a large light-grey ground plane. Three similar ' +
    'grey rectangular occluders are evenly spaced left, centre and right in an upper-middle row, ' +
    'corresponding to world x positions -22, 0 and 22 on the 80×60 ground. Each casts a separate dark ' +
    'shadow displaced down and to the right by the angled light; for the centre object the dark patch ' +
    'near world (5,-5) is plainly darker than lit ground at (13,-5) on the same row. The three ' +
    'shadows do not merge, vanish, cling directly under the boxes or spill beyond the bounded ground.',
);

// WebGPU twin of the large-scene GL fixture. A tight light-space fit and one authored texel of normal
// bias prove that both backends derive the same scale-relative receiver offset.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080a10ff,
});
registerWgpuBlinnPhongMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 4,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

const material = createBlinnPhongMaterial({
  diffuse: 0xa8aaaeff,
  shininess: 12,
  specular: 0x181818ff,
});
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createPlaneMeshGeometry(80, 60), [material]));

for (const x of [-22, 0, 22]) {
  const occluder = createMesh(createBoxMeshGeometry(8, 12, 8), [material]);
  setVector3(occluder.position, x, 6, -8);
  invalidateNodeLocalTransform(occluder);
  addNodeChild(scene, occluder);
}

const camera = createCamera3D({
  far: 200,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 34, halfWidth: 45 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 75, 0), createVector3(0, 0, 0), createVector3(0, 0, -1));

const direction = createVector3(0.5, -1, 0.3);
normalizeVector3(direction, direction);
const lights = {
  ambient: createAmbientLight({ color: 0x384050ff, intensity: 0.08 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction,
    intensity: 3,
    normalBias: 1,
    pcfRadius: 0,
    shadowBias: 0,
  }),
};

const sceneBounds = createAabb();
getNode3DWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 200,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3DTightFit(shadowCamera, direction, sceneBounds, 1.03);

prepareScene3DRender(state, scene, camera, lights);
beginWgpuFrame(state);
drawWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
drawWgpuScene3D(state, scene, camera, lights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const shadowX = Math.round((0.5 + 5 / 90) * bitmap.width);
  const litX = Math.round((0.5 + 13 / 90) * bitmap.width);
  const sampleY = Math.round((0.5 - 5 / 68) * bitmap.height);
  const shadowLuminance = getBitmapPixelLuminance(bitmap, shadowX, sampleY);
  const litLuminance = getBitmapPixelLuminance(bitmap, litX, sampleY);
  if (litLuminance <= 32) {
    throw new Error(`[shadow-scene-scale] lit ground is blank (${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 28 >= litLuminance) {
    throw new Error(
      `[shadow-scene-scale] fitted shadow is missing: shadow ${shadowLuminance}, lit ground ${litLuminance}`,
    );
  }
}
