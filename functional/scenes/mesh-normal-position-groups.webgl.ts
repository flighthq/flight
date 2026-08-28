import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryPositionGroups,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x080b12) with two perpendicular triangles forming a V-shape sharing a vertical edge. The shape is centered at (0.5*W, 0.5*H) = (400, 300), spanning x 0.27*W–0.73*W ≈ 219–581, y 0.16*H–0.84*H ≈ 95–505, with the shared vertical edge at the center and the two wings extending to the left and right. The normal computation gives both copies of the shared edge the same diagonal normal, so lighting transitions smoothly across the seam. A directional light brightens the right face and darkens the left face. The material is a light gray (0xd8dde8) with no specular highlight.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080b12ff,
  contextAttributes: { alpha: false, antialias: false, preserveDrawingBuffer: true },
});
registerStandardGlTextureResolvers(state);
registerGlBlinnPhongMaterial(state);

const pipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

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

// Two perpendicular triangles duplicate their vertical shared edge so each side can carry distinct
// UVs. Exact-position grouping gives both copies the same diagonal normal. A light from +Z makes the
// right face brighten away from the seam and the left face darken, while interpolation remains
// continuous immediately across the duplicated edge.
const vertices = new Float32Array(6 * 12);
setVertex(vertices, 0, 0, -1.2, 0, 0, 0);
setVertex(vertices, 1, 1.2, 0, 0, 1, 0.5);
setVertex(vertices, 2, 0, 1.2, 0, 0, 1);
setVertex(vertices, 3, 0, -1.2, 0, 0.25, 0);
setVertex(vertices, 4, 0, 0, 1.2, 0.75, 0.5);
setVertex(vertices, 5, 0, 1.2, 0, 0.25, 1);
const geometry = createMeshGeometry({
  indices: new Uint16Array([0, 1, 2, 3, 5, 4]),
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const positionGroups = computeMeshGeometryPositionGroups(geometry);
computeMeshGeometryNormals(geometry, geometry, positionGroups);

const material = createBlinnPhongMaterial({
  diffuse: 0xd8dde8ff,
  shininess: 8,
  specular: 0x000000ff,
});

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(3, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.08 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 1.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const x = Math.floor(bitmap.width / 2);
  const y = Math.floor(bitmap.height / 2);
  const nearOffset = Math.floor(bitmap.width * 0.02);
  const farOffset = Math.floor(bitmap.width * 0.12);
  const nearLeft = getBitmapPixelLuminance(bitmap, x - nearOffset, y);
  const nearRight = getBitmapPixelLuminance(bitmap, x + nearOffset, y);
  const farLeft = getBitmapPixelLuminance(bitmap, x - farOffset, y);
  const farRight = getBitmapPixelLuminance(bitmap, x + farOffset, y);
  if (Math.min(nearLeft, nearRight) <= 40) {
    throw new Error(`[mesh-normal-position-groups] seam is blank (left ${nearLeft}, right ${nearRight})`);
  }
  if (Math.abs(nearRight - nearLeft) >= 35) {
    throw new Error(`[mesh-normal-position-groups] seam lighting breaks (left ${nearLeft}, right ${nearRight})`);
  }
  if (farRight <= farLeft + 50) {
    throw new Error(
      `[mesh-normal-position-groups] folded faces do not diverge away from seam (left ${farLeft}, right ${farRight})`,
    );
  }
}

function setVertex(
  vertices: Float32Array,
  vertex: number,
  x: number,
  y: number,
  z: number,
  u: number,
  v: number,
): void {
  const base = vertex * 12;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 2] = z;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
}
