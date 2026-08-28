import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryTangents,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createImageResourceFromCanvas,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createTexture,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  normalizeVector3,
  prepareScene3DRender,
  registerWgpuBlinnPhongMaterial,
  registerWgpuImageTextureResolver,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x080b12) with two triangles forming a diamond shape sharing a vertical edge, the diamond centered at (0.5*W, 0.5*H) = (400, 300), spanning x W/2 ± 1.2*H/(6*tan(PI/8)) ≈ 110–690, y H/2 ± 1.2*H/(6*tan(PI/8)) ≈ 10–590. The right triangle has a mirrored UV relative to the left. A constant normal map tilts shading rightward on the right face and leftward on the mirrored face. A directional light from the right makes the right half bright and the left half dark. The material is a light gray (0xd8dde8) with no specular highlight.',
);

const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x080b12ff });
registerWgpuImageTextureResolver(state);
registerWgpuBlinnPhongMaterial(state);

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
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

// WebGPU leg of mesh-tangent-mirrored-uv.webgl.ts. The geometry and assertion are deliberately repeated:
// functional backend files are self-contained, and matching fingerprints additionally prove the two
// shader families consume Flight's repaired tangent records the same way.
const vertices = new Float32Array(4 * 12);
setVertex(vertices, 0, 0, -1.2, 0, 0);
setVertex(vertices, 1, 1.2, 0, 1, 0);
setVertex(vertices, 2, 0, 1.2, 0, 1);
setVertex(vertices, 3, -1.2, 0, 1, 0);
const geometry = createMeshGeometry({
  indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
  vertices,
});
computeMeshGeometryTangents(geometry, geometry);

const material = createBlinnPhongMaterial({
  diffuse: 0xd8dde8ff,
  normalMap: createTexture({
    colorSpace: 'linear',
    dimension: '2d',
    source: createImageResourceFromCanvas(createPositiveTangentNormalMap()),
  }),
  normalScale: 1,
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
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

const direction = createVector3(-1, 0, -1);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.04 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const y = Math.floor(bitmap.height / 2);
  const offset = Math.floor(bitmap.width * 0.12);
  const left = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width / 2) - offset, y);
  const right = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width / 2) + offset, y);
  if (right <= 50) throw new Error(`[mesh-tangent-mirrored-uv] lit half is blank (luminance ${right})`);
  if (right <= left + 50) {
    throw new Error(
      `[mesh-tangent-mirrored-uv] mirrored tangent did not separate lighting (left ${left}, right ${right})`,
    );
  }
}

function setVertex(vertices: Float32Array, vertex: number, x: number, y: number, u: number, v: number): void {
  const base = vertex * 12;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 5] = 1;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
}

function createPositiveTangentNormalMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgb(255, 128, 255)';
  context.fillRect(0, 0, 2, 2);
  return canvas;
}
