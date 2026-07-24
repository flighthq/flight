import { createScene } from '@flighthq/scene';
import { drawGlScene, prepareGlSceneForwardLights } from '@flighthq/scene-gl';
import type { GlRenderEffectPipeline, Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createBoxMeshGeometry,
  createCamera3D,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createOrthographicProjection,
  createPointLight,
  createSceneLights,
  createSpotLight,
  createVector3,
  endGlRenderEffectPipeline,
  getSurfacePixelLuminance,
  invalidateNodeLocalTransform,
  prepareSceneRender,
  registerBlinnPhongGlMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
} from '@flighthq/sdk';

// Twelve independently lit meshes demonstrate per-object selection. Four finite-range decoy lights
// are intentionally first in input order and far outside the field; the twelve useful lights come
// last. The old scene-global first-four pack therefore leaves the field dark, while the explicit
// prepareGlSceneForwardLights pass selects the nearby contributors for each mesh.

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
  diffuse: 0x707884ff,
  shininess: 24,
  specular: 0x282828ff,
});
const scene = createScene().root;
const pointLights = [];
const spotLights = [];
const colors = [0xff6040ff, 0x60a0ffff, 0x70ff80ff, 0xffd060ff];

// These are the four lights the old global pack chose. Their short ranges do not reach the field.
for (let i = 0; i < 4; i++) {
  pointLights.push(
    createPointLight({
      color: colors[i],
      intensity: 40,
      position: { x: 40 + i * 5, y: 3, z: 40 },
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

// Three overlapping spots share the centre-left mesh with its nearby points. The correct per-family
// policy keeps all three spots in addition to the four strongest points; a combined four-light
// budget changes this mesh's color fingerprint even though the point-only rows still render.
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

beginGlRenderEffectPipeline(state, pipeline);
renderGlBackground(state);
state.gl.depthMask(true);
state.gl.clearDepth(1);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
const renderList = prepareSceneRender(state, scene, camera, lights);
const forwardLights = prepareGlSceneForwardLights(state, renderList, lights);
drawGlScene(state, scene, camera, lights, forwardLights);
endGlRenderEffectPipeline(state, pipeline, []);

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
    throw new Error(
      `[light-many-point] only ${litCount}/12 near-light meshes are lit — per-object selection did not beat first-four truncation`,
    );
  }
}
