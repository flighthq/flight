import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, drawGlScene3DShadowMap } from '@flighthq/scene3d-gl';
import type { Bitmap, GlRenderEffectPipeline } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginGlRenderEffectPipeline,
  configureDirectionalShadowCamera3D,
  copyQuaternion,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createMeshGeometry,
  createNode3D,
  createOrthographicProjection,
  createPerspectiveProjection,
  createPlaneMeshGeometry,
  createQuaternion,
  createSkeleton3D,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  getNode3DWorldBounds,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  prepareScene3DSkinning,
  registerGlBlinnPhongMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setVector3,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 view shows a light-grey ground plane and a narrow light-grey bar rising near the ' +
    'centre with its upper half bent about 70 degrees sideways. An angled light casts a matching dark ' +
    'posed silhouette onto the ground: the shadow extends laterally through roughly (57%,59%), while ' +
    'adjacent ground near (66%,59%) stays much brighter. The shadow is not the compact straight ' +
    'bind-pose patch at the root, the bent bar is not missing, and the foreground remains lit rather ' +
    'than becoming uniformly dark.',
);

// A posed two-joint bar casts onto a ground plane from an angled sun. The upper ring is fully weighted
// to a joint rotated 70 degrees around Z, so the cast silhouette extends laterally; a bind-pose depth
// pass instead leaves only a compact shadow near the root. The WebGPU twin is the regression target.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerGlBlinnPhongMaterial(state);
const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

const material = createBlinnPhongMaterial({ diffuse: 0xb0b4bcff, shininess: 12, specular: 0x101010ff });
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createPlaneMeshGeometry(8, 8), [material]));

const halfWidth = 0.3;
const ringY = [0, 1, 2];
const ringJoint = [0, 0, 1];
const cornerX = [-halfWidth, halfWidth, halfWidth, -halfWidth];
const cornerZ = [-halfWidth, -halfWidth, halfWidth, halfWidth];
const vertices = new Float32Array(ringY.length * 4 * 20);
for (let ring = 0; ring < ringY.length; ring++) {
  for (let corner = 0; corner < 4; corner++) {
    const offset = (ring * 4 + corner) * 20;
    vertices[offset] = cornerX[corner];
    vertices[offset + 1] = ringY[ring];
    vertices[offset + 2] = cornerZ[corner];
    vertices[offset + 3] = cornerX[corner];
    vertices[offset + 5] = cornerZ[corner];
    vertices[offset + 8] = 1;
    vertices[offset + 12] = ringJoint[ring];
    vertices[offset + 16] = 1;
  }
}
const indices: number[] = [];
for (let ring = 0; ring < ringY.length - 1; ring++) {
  for (let corner = 0; corner < 4; corner++) {
    const current = ring * 4 + corner;
    const nextCorner = ring * 4 + ((corner + 1) % 4);
    const nextRing = (ring + 1) * 4 + corner;
    const nextRingCorner = (ring + 1) * 4 + ((corner + 1) % 4);
    indices.push(current, nextCorner, nextRingCorner, current, nextRingCorner, nextRing);
  }
}

const root = createNode3D();
const bend = createNode3D();
setVector3(bend.position, 0, 1, 0);
invalidateNodeLocalTransform(bend);
addNodeChild(root, bend);
const skeleton = createSkeleton3D([root, bend]);
const rotation = createQuaternion();
setQuaternionFromAxisAngle(rotation, createVector3(0, 0, 1), (70 * Math.PI) / 180);
copyQuaternion(bend.rotation, rotation);
invalidateNodeLocalTransform(bend);
addNodeChild(scene, root);

const geometry = createMeshGeometry({
  indices: new Uint16Array(indices),
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const mesh = createMesh(geometry, [material]);
mesh.skin = { skeleton };
addNodeChild(scene, mesh);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 5, 7), createVector3(0, 0.5, 0), createVector3(0, 1, 0));

const direction = createVector3(0.7, -1, 0.25);
normalizeVector3(direction, direction);
const lights = {
  ambient: createAmbientLight({ color: 0x404858ff, intensity: 0.12 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction,
    intensity: 3,
    pcfRadius: 0,
  }),
};

prepareScene3DSkinning(scene);
const sceneBounds = createAabb();
getNode3DWorldBounds(sceneBounds, scene);
const shadowCamera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: 1, halfWidth: 1 }),
});
configureDirectionalShadowCamera3D(shadowCamera, direction, sceneBounds);

prepareScene3DRender(state, scene, camera, lights);
drawGlScene3DShadowMap(state, scene, shadowCamera, lights.directional);
beginGlRenderEffectPipeline(state, pipeline, 'linear');
renderGlBackground(state);
state.gl.depthMask(true);
state.gl.clearDepth(1);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
drawGlScene3D(state, scene, camera, lights);
endGlRenderEffectPipeline(state, pipeline, []);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const lit = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.2), Math.floor(bitmap.height * 0.8));
  if (lit <= 24) throw new Error(`[shadow-skinning] ground is blank (${lit})`);
  // The posed upper segment creates the right-hand shadow foot at (57%,59%). A rigid bind-pose depth
  // pass leaves this probe on the same lit ground as the adjacent control at (66%,59%).
  const posedShadow = getBitmapPixelLuminance(
    bitmap,
    Math.floor(bitmap.width * 0.57),
    Math.floor(bitmap.height * 0.59),
  );
  const litControl = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.66), Math.floor(bitmap.height * 0.59));
  if (posedShadow + 64 >= litControl) {
    throw new Error(`[shadow-skinning] posed shadow ${posedShadow}, adjacent lit ground ${litControl}`);
  }
}
