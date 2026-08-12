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

// WHAT THIS SCENE COVERS, STATED NARROWLY ON PURPOSE: a mesh under a mirroring model transform is
// still DRAWN and still shades differently from its unmirrored twin. It proves the front-face
// convention follows the model determinant. It does NOT prove the tangent handedness fix — see the
// note at the bottom of this file for why that needs a different scene, and what it would take.
//
// TWO QUADS, IDENTICAL IN EVERY WAY EXCEPT THAT THE RIGHT ONE IS MIRRORED BY ITS MODEL TRANSFORM
// (scale.x = -1, determinant -1). Both carry the same constant +tangent-space-X normal map, so on an
// unmirrored surface the shading tilts toward +X and a light from screen-left leaves the -X side of
// each quad bright.
//
// A mirror reverses handedness. The bitangent is rebuilt in the shader as w * cross(N, T), so unless
// the model matrix determinant reaches tangent.w, the mirrored quad reconstructs its frame with the
// wrong hand and its bright side lands on the SAME side as the unmirrored quad instead of the
// opposite one. That is the whole test: the two quads must be bright on OPPOSITE sides of their own
// centres. A non-blank check, or a check on either quad alone, passes either way.
//
// The material is BlinnPhong — lighting-dependent on purpose. An unlit material cannot express this
// defect at all, which is exactly how the existing mesh-cone and mesh-cylinder scenes miss winding.
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
plain.position.x = -1.35;
invalidateNodeLocalTransform(plain);
addNodeChild(scene, plain);

const mirrored = createMesh(createNormalMappedQuad(), [material]);
mirrored.position.x = 1.35;
mirrored.scale.x = -1;
invalidateNodeLocalTransform(mirrored);
addNodeChild(scene, mirrored);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: width / height, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

const direction = createVector3(1, 0, -1);
normalizeVector3(direction, direction);
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 0.04 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction, intensity: 1.5 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  // Each quad is flat and carries a CONSTANT tangent-space normal, so each shades uniformly — there
  // is no gradient to read WITHIN a quad. The signal is BETWEEN them: the plain quad tilts its
  // shading normal one way in world space, and the mirrored quad, having a reversed tangent frame,
  // must tilt it the other way. Under a light from one side that makes one quad bright and the other
  // dark. If the model determinant never reaches tangent.w, the mirrored quad rebuilds its bitangent
  // with the wrong hand, tilts the SAME way as the plain one, and the two match.
  const y = Math.floor(bitmap.height / 2);
  const plain = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.25), y);
  const mirrored = getBitmapPixelLuminance(bitmap, Math.floor(bitmap.width * 0.75), y);

  if (Math.max(plain, mirrored) <= 40) {
    throw new Error(`[mesh-mirrored-facing] neither quad is lit (plain ${plain}, mirrored ${mirrored})`);
  }
  if (Math.min(plain, mirrored) <= 12) {
    throw new Error(
      `[mesh-mirrored-facing] a quad is missing entirely, not merely dark — a mirrored mesh ` +
        `is being culled because the front-face convention does not follow the model determinant ` +
        `(plain ${plain}, mirrored ${mirrored})`,
    );
  }
  if (Math.abs(plain - mirrored) <= 60) {
    throw new Error(
      `[mesh-mirrored-facing] the mirrored quad shades like the plain one, so the model ` +
        `determinant is not reaching tangent.w and its bitangent is rebuilt with the wrong hand ` +
        `(plain ${plain}, mirrored ${mirrored})`,
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

function createBitangentTiltedNormalMap(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const context = canvas.getContext('2d')!;
  context.fillStyle = 'rgb(215, 215, 255)';
  context.fillRect(0, 0, 2, 2);
  return canvas;
}

// WHY THIS SCENE DOES NOT COVER THE TANGENT-HANDEDNESS HALF OF THE SAME FIX, worked out by reverting
// that half and watching this scene keep passing. With a mirror along X and a tangent-space normal
// tilted (tx, ty), the plain quad tilts (+tx, +ty) in world space. The mirrored quad tilts
// (-tx, +ty) with the handedness fix and (-tx, -ty) without it — the X component is the SAME either
// way, so a light along X cannot tell them apart, and that is the light this scene uses to separate
// the quads at all. A light along Y does distinguish them, but then correct behaviour means the two
// quads MATCH, and "these two are equal" is a weak positive: it also holds when nothing renders.
// Covering that half wants a scene whose assertion stays positive under a Y-dominant light — most
// likely a third quad mirrored in Y, so correct handedness produces a specific three-way pattern
// rather than an equality. Left undone deliberately rather than asserted weakly.
