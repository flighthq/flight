import { createScene } from '@flighthq/scene';
import { drawGlScene, drawGlSceneShadowMap } from '@flighthq/scene-gl';
import type { GlRenderEffectPipeline, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera3DTightFit,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createVector3,
  endGlRenderEffectPipeline,
  getSceneNodeWorldBounds,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
} from '@flighthq/sdk';

// A large 80×60 architectural ground and three 12-unit occluders exercise an explicit tight
// light-space shadow fit. A top-down camera and angled sun separate each occluder from its cast
// shadow, giving the oracle stable lit/shadow regions at scene scale.

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080a10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerBlinnPhongGlMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 4,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const material = createBlinnPhongMaterial({
  diffuse: 0xa8aaaeff,
  shininess: 12,
  specular: 0x181818ff,
});
const scene = createScene().root;
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
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 3 }),
};

const sceneBounds = createAabb();
getSceneNodeWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 200,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3DTightFit(shadowCamera, direction, sceneBounds, 1.03);
drawGlSceneShadowMap(state, scene, shadowCamera);

beginGlRenderEffectPipeline(state, pipeline);
renderGlBackground(state);
state.gl.depthMask(true);
state.gl.clearDepth(1);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
prepareSceneRender(state, scene, camera, lights);
drawGlScene(state, scene, camera, lights);
endGlRenderEffectPipeline(state, pipeline, []);

export function assertRender(surface: Readonly<Surface>): void {
  // The centre occluder casts down-light along +X/+Z. Sample its separated shadow around world
  // (5,-5), and a lit ground patch at world (13,-5) on the same image row.
  const shadowX = Math.round((0.5 + 5 / 90) * surface.width);
  const litX = Math.round((0.5 + 13 / 90) * surface.width);
  const sampleY = Math.round((0.5 - 5 / 68) * surface.height);
  const shadowLuminance = getSurfacePixelLuminance(surface, shadowX, sampleY);
  const litLuminance = getSurfacePixelLuminance(surface, litX, sampleY);
  if (litLuminance <= 32) {
    throw new Error(`[shadow-scene-scale] lit ground is blank (${litLuminance}) — scene did not render`);
  }
  if (shadowLuminance + 28 >= litLuminance) {
    throw new Error(
      `[shadow-scene-scale] fitted shadow is missing: shadow ${shadowLuminance}, lit ground ${litLuminance}`,
    );
  }
}
