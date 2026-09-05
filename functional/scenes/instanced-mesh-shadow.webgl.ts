import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, drawGlScene3DShadowMap } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, GlRenderEffectPipeline, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  appendInstancedMeshInstance,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createBoxMeshGeometry,
  createCamera3D,
  createDirectionalLight,
  createInstancedMesh,
  createMatrix4,
  createMesh,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createScene3DLights,
  createStandardPbrMaterial,
  createVector3,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  scaleMatrix4,
  setCamera3DViewMatrix4FromLookAt,
  translateMatrix4,
  beginGlRenderEffectPipeline,
  createGlCanvasElement,
  createGlContextFromCanvasElement,
  createGlContextState,
  createGlRenderEffectPipeline,
  createGlRenderState,
  endGlRenderEffectPipeline,
  registerGlStandardPbrMaterial,
  renderGlBackground,
  scene2dGlPipeline,
} from '@flighthq/sdk';
import { declareAntialiasingPolicy, declareExpectedImageDescription } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800x600 dark field (0x0a0c10) mostly filled by a light-grey ground plane (luminance ~185) lit from straight above, with three dark cubes from ONE InstancedMesh hovering in a row across the upper half and each casting its OWN separate shadow onto the ground below it. The three shadows sit in a band near y = 0.56*H ~= 336, centred near x = 0.175*W ~= 140, 0.5*W = 400 and 0.825*W ~= 660, with clearly lit ground (luminance ~184) in the gaps between them near x = 0.35*W = 280 and 0.70*W = 560. The instance matrices scale the shared 4-unit box down to 0.8 units, so the shadows are three small quads rather than one plane-wide dark region.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(
  createGlContextState(
    createGlContextFromCanvasElement(canvas, {
      contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
    }),
  ),
  scene2dGlPipeline,
  { pixelRatio, backgroundColor: 0x0a0c10ff },
);
registerGlStandardPbrMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
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
  shadowCamera: Readonly<Camera3D>,
): void {
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3DShadowMap(state, scene, shadowCamera, lights.directional);

  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// instanced-mesh-shadow — instanced shadow CASTERS. The batch shares one 4-unit box geometry and each instance
// matrix scales it to 0.8 and moves it along X, exactly the shape real content takes when a model's
// authoring scale rides in the instance transform rather than the node.
//
// A depth pass that ignores instance matrices draws the raw 4-unit box ONCE at the node origin: a single
// caster five times the intended size, which floods the map and darkens the whole plane. So the oracle
// checks the lit gaps BETWEEN the cubes as well as the shadows under them — "is there a shadow" alone
// passes on a plane-wide blackout, which is the failure this scene exists to catch.

const logicalWidth = width / scale;
const logicalHeight = height / scale;

const material = createStandardPbrMaterial({ baseColor: 0xb8b8b8ff, metallic: 0, roughness: 0.8 });

const scene = createScene3D().root;

const ground = createMesh(createPlaneMeshGeometry(12, 12), [material]);
addNodeChild(scene, ground);

// THE FEATURE UNDER TEST: one batch, three instances, each carrying its own scale AND translation.
const CASTER_XS = [-2.2, 0, 2.2] as const;
const INSTANCE_SCALE = 0.2;
const batch = createInstancedMesh(createBoxMeshGeometry(4, 4, 4), [material], 4);
addNodeChild(scene, batch);
for (const x of CASTER_XS) {
  const matrix = createMatrix4();
  translateMatrix4(matrix, matrix, x, 1.3, 0);
  scaleMatrix4(matrix, matrix, INSTANCE_SCALE, INSTANCE_SCALE, INSTANCE_SCALE);
  appendInstancedMeshInstance(batch, matrix);
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 3, 5), createVector3(0, 0.4, 0), createVector3(0, 1, 0));

const direction = createVector3(0, -1, 0);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0x404040ff, intensity: 0.12 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction,
    intensity: 3,
    normalBias: 0,
    pcfRadius: 1,
    shadowBias: 0.0015,
  }),
});

// Fitted by hand rather than from getNode3DWorldBounds: a world-bounds walk that ignores instance
// matrices would size the shadow camera off the same wrong extent this scene is testing.
const shadowCamera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3D(shadowCamera, direction, createAabb(-4, -0.2, -4, 4, 2.2, 4));

render(scene, camera, lights, shadowCamera);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const w = bitmap.width;
  const h = bitmap.height;
  // The shadow band on the ground beneath the hovering cubes, and the lit gaps between them. Sample
  // positions were read off the captured frame rather than predicted.
  const y = Math.round(h * 0.56);
  const shadowed = [0.175, 0.5, 0.825].map((fx) => getBitmapPixelLuminance(bitmap, Math.round(w * fx), y));
  const lit = [0.35, 0.7].map((fx) => getBitmapPixelLuminance(bitmap, Math.round(w * fx), y));
  const minLit = Math.min(...lit);
  const maxShadow = Math.max(...shadowed);

  // 1) The gaps between the cubes are lit ground. A caster drawn at the WRONG SCALE — the raw 4-unit
  //    geometry, instance matrices ignored — floods the map and darkens the whole plane, and this is the
  //    check that catches it. "Is there a shadow" alone passes happily on a plane-wide blackout.
  if (minLit <= 40) {
    throw new Error(
      `[instanced-mesh-shadow] the ground between the cubes is dark (min luminance ${minLit}) — one oversized caster shadowed the whole plane instead of three instance-sized ones`,
    );
  }

  // 2) Every instance casts its own shadow. With the casters skipped the plane is uniformly lit.
  for (let i = 0; i < shadowed.length; i++) {
    if (shadowed[i]! + 30 >= minLit) {
      throw new Error(
        `[instanced-mesh-shadow] instance ${i} casts no shadow: ground beneath it (${shadowed[i]}) is not clearly darker than the lit ground (${minLit})`,
      );
    }
  }

  // 3) State the contrast explicitly, so a regression that merely dims the whole frame cannot satisfy
  //    checks 1 and 2 together.
  if (minLit - maxShadow < 30) {
    throw new Error(
      `[instanced-mesh-shadow] shadow contrast collapsed: lit ${minLit} vs shadowed ${maxShadow} — the shadows are not per-instance`,
    );
  }
}
