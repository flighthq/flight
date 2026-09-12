import { createWebWgpuCanvasElement } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  beginWgpuRenderPass,
  computeMeshGeometryTangents,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createTexture,
  createVector3,
  createWgpuAcquisition,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  createWgpuScreenRenderTarget,
  endWgpuRenderEffectPipeline,
  endWgpuRenderPass,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  scene3DWgpuPipeline,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark field (0x080b12) with three flat quads side by side, each centered at y 300. At depth 6, scale s = H/(12*tan(PI/8)) ≈ 121 px/unit. The left quad spans x W/2 − 3.2*s to W/2 − 1.2*s ≈ 14–255, the center quad x W/2 ± s ≈ 279–521, and the right quad x W/2 + 1.2*s to W/2 + 3.2*s ≈ 545–786 (all y H/2 ± s ≈ 179–421). Each carries a constant normal map. The left is plain; the center is mirrored in X; the right is mirrored in Y. Under a top-down directional light, the plain and X-mirrored quads shade the same brightness while the Y-mirrored quad shades differently — that three-way pattern gates correct tangent handedness. The material is a light gray (0xd8dde8) with no specular highlight.',
);

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWebWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

const acquisition = await createWgpuAcquisition(canvas);
if (acquisition === null) throw new Error('WebGPU is unavailable in this environment');
export const screen = createWgpuScreenRenderTarget(acquisition.device, canvas, { format: acquisition.format });
export const state = createWgpuRenderState(acquisition.device, scene3DWgpuPipeline, {
  format: acquisition.format,
  pixelRatio,
});
const screenClear = { color: [0x0a / 0xff, 0x0c / 0xff, 0x10 / 0xff, 1], depth: 1.0 } as const;

const pipeline = createWgpuRenderEffectPipeline(state, {
  sampleCount: 1,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  const pass = beginWgpuRenderPass(state, screen, screenClear);
  const scenePass = beginWgpuRenderEffectPipeline(pass, pipeline, screenClear, 'linear');
  prepareScene3DRender(state, scene, camera, lights);
  drawWgpuScene3D(scenePass, scene, camera, lights);
  endWgpuRenderEffectPipeline(scenePass, pipeline, []);
  endWgpuRenderPass(pass);
}

registerWgpuFunctionalTarget(state, screen, scale);

const material = createBlinnPhongMaterial({
  diffuse: 0xd8dde8ff,
  normalMap: createTexture({
    colorSpace: 'linear',
    dimension: '2d',
    source: createWebImageResourceFromCanvas(createBitangentTiltedNormalMap()),
  }),
  normalScale: 1,
  shininess: 8,
  specular: 0x000000ff,
});

const scene = createScene3D().root;

const plain = createMesh(createNormalMappedQuad(), [material]);
plain.position.x = -QUAD_OFFSET_X;
invalidateNodeLocalTransform(plain);
addNodeChild(scene, plain);

const mirroredX = createMesh(createNormalMappedQuad(), [material]);
mirroredX.scale.x = -1;
invalidateNodeLocalTransform(mirroredX);
addNodeChild(scene, mirroredX);

const mirroredY = createMesh(createNormalMappedQuad(), [material]);
mirroredY.position.x = QUAD_OFFSET_X;
mirroredY.scale.y = -1;
invalidateNodeLocalTransform(mirroredY);
addNodeChild(scene, mirroredY);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Y-dominant, with enough Z to keep the down-tilted quad clearly lit rather than clamped to black: the
// assertion is about a difference between three lit quads, and a quad driven to zero would be read as
// missing instead of as differing.
const direction = createVector3(0, -1, -1.2);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.04 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const y = Math.floor(bitmap.height / 2);
  const plainLuminance = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * SAMPLE_FRACTION_LEFT), y);
  const mirroredXLuminance = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * SAMPLE_FRACTION_CENTRE), y);
  const mirroredYLuminance = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * SAMPLE_FRACTION_RIGHT), y);
  const reading = `plain ${plainLuminance}, mirrored-X ${mirroredXLuminance}, mirrored-Y ${mirroredYLuminance}`;

  // A mirrored quad that vanished is a front-face failure, not a handedness one. Separating the two
  // keeps this scene's diagnostic from blaming the half it is actually built to measure.
  if (Math.min(plainLuminance, mirroredXLuminance, mirroredYLuminance) <= 12) {
    throw new Error(
      `[mesh-tangent-mirror-handedness] a quad is missing entirely rather than merely shaded ` +
        `differently — a mirrored mesh is being culled, so the front-face convention is not following ` +
        `the model determinant (${reading})`,
    );
  }

  // The X-mirrored quad must shade like the plain one: mirroring across X leaves the Y component of the
  // tilted normal alone, but only once the determinant has reversed tangent.w.
  if (Math.abs(plainLuminance - mirroredXLuminance) > AGREEMENT_TOLERANCE) {
    throw new Error(
      `[mesh-tangent-mirror-handedness] the X-mirrored quad does not shade like the plain one, so the ` +
        `model determinant is not reaching tangent.w and its bitangent is rebuilt with the wrong hand ` +
        `(${reading})`,
    );
  }

  // …and the Y-mirrored quad must NOT. This is the half that keeps the assertion positive: without it,
  // a frame where every quad shades identically — including one where nothing is tilted at all — would
  // satisfy the agreement above.
  if (Math.abs(plainLuminance - mirroredYLuminance) < SEPARATION_MINIMUM) {
    throw new Error(
      `[mesh-tangent-mirror-handedness] the Y-mirrored quad shades like the plain one, so the tangent ` +
        `frame is not being mirrored at all and the three quads are indistinguishable (${reading})`,
    );
  }
}

function createBitangentTiltedNormalMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d')!;
  // Tilted along the BITANGANT axis only (x ≈ 0, y > 0): the X component is what a mirror along X
  // leaves invariant, so a tilt carrying one would blunt the very difference this scene reads.
  context.fillStyle = 'rgb(128, 180, 255)';
  context.fillRect(0, 0, 2, 2);
  return canvas;
}

function createNormalMappedQuad(): ReturnType<typeof createMeshGeometry> {
  const vertices = new Float32Array(4 * 12);
  setVertex(vertices, 0, -1, -1, 0, 0);
  setVertex(vertices, 1, 1, -1, 1, 0);
  setVertex(vertices, 2, 1, 1, 1, 1);
  setVertex(vertices, 3, -1, 1, 0, 1);
  const geometry = createMeshGeometry({
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    layout: CANONICAL_MESH_GEOMETRY_LAYOUT,
    vertices,
  });
  computeMeshGeometryTangents(geometry, geometry);
  return geometry;
}

function setVertex(vertices: Float32Array, vertex: number, x: number, y: number, u: number, v: number): void {
  const base = vertex * 12;
  vertices[base] = x;
  vertices[base + 1] = y;
  vertices[base + 5] = 1;
  vertices[base + 10] = u;
  vertices[base + 11] = v;
}

// Wide enough to absorb per-driver rasterization differences between two quads that shade identically in
// exact arithmetic, far below the separation the tilt actually produces.
const AGREEMENT_TOLERANCE = 24;
// The Y-mirrored quad must differ by well over the agreement tolerance, so "agrees" and "differs" cannot
// both be satisfied by the same pair of readings.
const SEPARATION_MINIMUM = 45;
