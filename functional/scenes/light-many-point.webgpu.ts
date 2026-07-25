import { createScene } from '@flighthq/scene';
import { drawWgpuScene, prepareWgpuSceneForwardLights } from '@flighthq/scene-wgpu';
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createMesh,
  createOrthographicProjection,
  createPointLight,
  createSceneLights,
  createSpotLight,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  prepareSceneRender,
  registerBlinnPhongWgpuMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

// WebGPU mirror of light-many-point.webgl. Four finite-range decoys come first; only per-mesh
// contribution selection can choose the twelve nearby lights and illuminate the field.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);
export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x080a10ff });
registerBlinnPhongWgpuMaterial(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 4,
});
export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

const material = createBlinnPhongMaterial({ diffuse: 0x707884ff, shininess: 24, specular: 0x282828ff });
const scene = createScene().root;
const pointLights = [];
const spotLights = [];
const colors = [0xff6040ff, 0x60a0ffff, 0x70ff80ff, 0xffd060ff];
for (let index = 0; index < 4; index++) {
  pointLights.push(
    createPointLight({
      color: colors[index],
      intensity: 40,
      position: { x: 40 + index * 5, y: 3, z: 40 },
      range: 5,
    }),
  );
}
const xPositions = [-4.5, -1.5, 1.5, 4.5];
const zPositions = [-2.5, 0, 2.5];
for (let row = 0; row < zPositions.length; row++) {
  for (let column = 0; column < xPositions.length; column++) {
    const x = xPositions[column];
    const z = zPositions[row];
    const mesh = createMesh(createBoxMeshGeometry(1.35, 0.6, 1.35), [material]);
    setVector3(mesh.position, x, 0.3, z);
    invalidateNodeLocalTransform(mesh);
    addNodeChild(scene, mesh);
    pointLights.push(
      createPointLight({
        color: colors[(row + column) % colors.length],
        intensity: 32,
        position: { x, y: 2.2, z },
        range: 4.5,
      }),
    );
  }
}
for (const color of [0xff3030ff, 0x30ff30ff, 0x3030ffff]) {
  spotLights.push(
    createSpotLight({
      color,
      direction: { x: 0, y: -1, z: 0 },
      innerConeDegrees: 20,
      intensity: 18,
      outerConeDegrees: 38,
      position: { x: -1.5, y: 2.4, z: 0 },
      range: 4.5,
    }),
  );
}
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 4.5, halfWidth: 6 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 12, 0), createVector3(0, 0, 0), createVector3(0, 0, -1));
const lights = createSceneLights({
  ambient: createAmbientLight({ color: 0x202838ff, intensity: 0.015 }),
  directional: null,
  point: pointLights,
  spot: spotLights,
});

renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
const renderList = prepareSceneRender(state, scene, camera, lights);
const forwardLights = prepareWgpuSceneForwardLights(state, renderList, lights);
drawWgpuScene(state, scene, camera, lights, forwardLights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

export function assertRender(surface: Readonly<Surface>): void {
  let litCount = 0;
  for (let row = 0; row < zPositions.length; row++) {
    for (let column = 0; column < xPositions.length; column++) {
      const x = Math.round((0.5 + xPositions[column] / 12) * surface.width);
      const y = Math.round((0.5 + zPositions[row] / 9) * surface.height);
      if (getSurfacePixelLuminance(surface, x, y) > 48) litCount++;
    }
  }
  if (litCount < 10) {
    throw new Error(`[light-many-point] only ${litCount}/12 meshes lit — per-object selection failed`);
  }
}
