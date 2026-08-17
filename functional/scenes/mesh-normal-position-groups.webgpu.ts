import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryPositionGroups,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { registerWgpuFunctionalTarget } from '@ft/verify';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x080b12ff });
registerWgpuImageTextureResolver(state);
registerWgpuBlinnPhongMaterial(state);

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
  beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(state, scene, camera, lights);
  endWgpuRenderEffectPipeline(state, pipeline, []);
  submitWgpuRenderPass(state);
}

registerWgpuFunctionalTarget(state, scale);

// WebGPU leg of mesh-normal-position-groups.webgl.ts. The geometry and assertion are deliberately
// repeated so each backend scene stays self-contained and proves its own lighting path.
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
