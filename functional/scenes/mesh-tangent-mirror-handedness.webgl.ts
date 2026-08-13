// mesh-tangent-mirror-handedness — gates the tangent-handedness half of the mirrored-model fix: that a
// model transform with a negative determinant reaches tangent.w, so the bitangent (rebuilt in the shader
// as w * cross(N, T)) is reconstructed with the correct hand on a mirrored instance.
//
// mesh-mirrored-facing covers the front-face half of the same fix and explicitly does NOT cover this
// half. Its own closing note works out why, and reverting the prelude term and watching that scene pass
// reproduces it: with a mirror along X and a tangent-space normal tilted (tx, ty), the plain quad tilts
// (+tx, +ty) in world space while the mirrored quad tilts (-tx, +ty) WITH the fix and (-tx, -ty) WITHOUT.
// The X component is identical either way, so the X-dominant light that scene uses to separate its quads
// is exactly the light that cannot see this defect.
//
// A Y-dominant light does see it — but under one, correct behaviour makes the plain and X-mirrored quads
// MATCH, and "these two are equal" is a weak positive that also holds when nothing renders at all. So a
// THIRD quad, mirrored in Y, turns the assertion back into a positive pattern:
//
//                        plain      mirrored-X   mirrored-Y
//   with the fix          +ty          +ty          -ty        → the Y-mirrored quad is the outlier
//   without the fix       +ty          -ty          +ty        → the X-mirrored quad is the outlier
//
// The oracle demands that specific three-way shape: the first two agree AND the third differs from them.
// Dropping the fix does not merely weaken it, it permutes which quad is the outlier, so both halves of
// the assertion fail. A blank or uniformly-lit frame fails the "third differs" half, so the pattern
// cannot be satisfied by nothing rendering.
//
// Sign-agnostic on purpose: whether computeMeshGeometryTangents yields w = +1 or -1 for this quad only
// decides which quads are bright, never which one is the odd one out, so the oracle asserts the shape and
// not the polarity.
//
// The material is BlinnPhong with black specular — lighting-dependent (an unlit material cannot express
// this defect) but pure diffuse, so each flat quad shades uniformly and a single sample per quad is the
// whole signal.
//
// This oracle gates webgl only — it is a webgl-scoped target like its siblings — and note that on any
// backend-agnostic scene assertRender never runs on dom at all (the DOM verifier returns after checking
// the target element has children). Nothing here speaks to WebGPU.
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, Camera3D, Node3D, Scene3DLights } from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  CANONICAL_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryTangents,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createImageResourceFromCanvas,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createTexture,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  normalizeVector3,
  prepareScene3DRender,
  registerGlBlinnPhongMaterial,
  registerStandardGlTextureResolvers,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x080b12ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerStandardGlTextureResolvers(state);
registerGlBlinnPhongMaterial(state);

const pipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

// Quad centres in world X, and the screen fractions they project to under the camera below. Kept as
// constants so the oracle samples where the geometry actually is rather than at guessed thirds.
const QUAD_OFFSET_X = 2.2;
const SAMPLE_FRACTION_LEFT = 0.168;
const SAMPLE_FRACTION_CENTRE = 0.5;
const SAMPLE_FRACTION_RIGHT = 0.832;

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

const material = createBlinnPhongMaterial({
  diffuse: 0xd8dde8ff,
  normalMap: createTexture({
    colorSpace: 'linear',
    dimension: '2d',
    source: createImageResourceFromCanvas(createBitangentTiltedNormalMap()),
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
