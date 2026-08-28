import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type { Bitmap, GlRenderEffectPipeline, Node3D, Skeleton3D } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginGlRenderEffectPipeline,
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
  createSkeleton3D,
  createVector3,
  endGlRenderEffectPipeline,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  prepareScene3DSkinning,
  registerGlBlinnPhongMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  skinVertices,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R10 G12 B16), two separate bright horizontal bars are ' +
    "centred one above the other. The upper bar is three times the lower bar's width: approximately " +
    '343 px versus 114 px, derived from world widths 3 and 1 across a 7-world-unit orthographic view ' +
    'mapped to 800 px. Their heights remain similar and a broad dark gap separates them. The bars do ' +
    'not share one width, overlap, join vertically or extend to the field edges.',
);

// scene-skin-two-skeletons — TWO skinned meshes with SEPARATE skeletons in ONE frame. The upper bar's
// joint scales x by 3 and the lower bar's does not, so a correct frame draws one wide bar and one narrow
// bar; a frame where the two skeletons share storage draws them the SAME width.
//
// This is the regression lock for the WebGPU skin palette arena. A WebGPU frame records every draw into
// one command encoder and submits once, so all queue writes land before any draw executes. While both
// skeletons wrote to one palette texture rewritten in place, every skinned draw in the frame sampled
// whichever palette was written LAST, and both bars collapsed to the same width — invisible with a single
// skinned mesh on screen, which is why it survived. Each skeleton now owns a distinct region of a
// per-frame arena and reads it through a base index carried per draw.
//
// It is also its own negative control: if the base index stops being per-draw, the two bars collapse
// together again, which is exactly the failure the scene was built to show.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebGlRenderSurface();
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

const material = createBlinnPhongMaterial({ diffuse: 0xffffffff, shininess: 1, specular: 0x000000ff });
const barHalfX = 0.5;
const halfWidth = 3.5;
const halfHeight = 2.625;
const scene = createScene3D().root;

function addBar(centerY: number, scaleX: number, jointCount: number, boundJoint: number): Skeleton3D {
  const halfX = barHalfX;
  const halfY = 0.35;
  const cornerX = [-halfX, halfX, halfX, -halfX];
  const cornerY = [-halfY, -halfY, halfY, halfY];
  const vertices = new Float32Array(4 * 20);
  for (let corner = 0; corner < 4; corner++) {
    const offset = corner * 20;
    vertices[offset] = cornerX[corner];
    vertices[offset + 1] = centerY + cornerY[corner];
    vertices[offset + 5] = 1;
    vertices[offset + 6] = 1;
    vertices[offset + 12] = boundJoint;
    vertices[offset + 16] = 1;
  }
  // Joints past the bound one are inert padding that exists only to widen the palette — see the call site.
  const root: Node3D = createNode3D();
  const joints: Node3D[] = [root];
  for (let joint = 1; joint < jointCount; joint++) {
    const node = createNode3D();
    addNodeChild(root, node);
    joints.push(node);
  }
  const skeleton = createSkeleton3D(joints);
  setVector3(joints[boundJoint].scale, scaleX, 1, 1);
  invalidateNodeLocalTransform(joints[boundJoint]);
  addNodeChild(scene, root);

  const mesh = createMesh(
    createMeshGeometry({
      indices: new Uint16Array([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]),
      layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
      vertices,
    }),
    [material],
  );
  mesh.skin = { skeleton };
  addNodeChild(scene, mesh);
  return skeleton;
}

const scaledBoundJoint = 1;
// 80 joints, with the bar weighted to joint 70, places this skeleton's matrices well past the first few
// texels, so an ordinary render drives the wide-palette path rather than leaving it to a unit test.
//
// ★ IT DRIVES THAT PATH BUT DOES NOT POLICE IT. Every joint in this skeleton is the identity matrix, so
// a draw that reads the WRONG joint still reads an identical matrix and this bar's width does not move.
// That is a property of how the skeleton is built here, not of any one backend, so it holds for this
// twin as much as for the WebGPU one — where forcing the consumed palette base to 0 was measured to
// leave the frame byte-identical. Detecting a wrong lookup needs a distinguishing joint in this palette.
const rigidJointCount = 80;
const rigidBoundJoint = 70;
const scaledSkeleton = addBar(1.2, 3, 2, scaledBoundJoint);
const rigidSkeleton = addBar(-1.2, 1, rigidJointCount, rigidBoundJoint);

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight, halfWidth }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

const lights = {
  ambient: createAmbientLight({ color: 0x404858ff, intensity: 0.1 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: createVector3(0, 0, -1),
    intensity: 1,
  }),
};

prepareScene3DSkinning(scene);
prepareScene3DRender(state, scene, camera, lights);
beginGlRenderEffectPipeline(state, pipeline, 'linear');
renderGlBackground(state);
state.gl.depthMask(true);
state.gl.clearDepth(1);
state.gl.clear(state.gl.DEPTH_BUFFER_BIT);
drawGlScene3D(state, scene, camera, lights);
endGlRenderEffectPipeline(state, pipeline, []);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const scaled = predictBarWidthPixels(scaledSkeleton, scaledBoundJoint, bitmap.width);
  const rigid = predictBarWidthPixels(rigidSkeleton, rigidBoundJoint, bitmap.width);
  // A scene where the CPU expects the two bars to match could not tell a shared palette from a correct
  // one, so the discriminating condition is checked rather than assumed.
  if (Math.abs(scaled - rigid) < 64) {
    throw new Error(`[scene-skin-two-skeletons] not a trial: CPU expects ${scaled}px and ${rigid}px`);
  }

  const upper = widestRow(bitmap, 0, Math.floor(bitmap.height * 0.45));
  const lower = widestRow(bitmap, Math.floor(bitmap.height * 0.55), bitmap.height);
  const tolerance = 8;
  // Both are reported whichever is at fault: which bar moved is the diagnosis. Equal widths mean the two
  // skeletons shared storage; one wrong width means that draw read the wrong region.
  const wrong = [
    Math.abs(upper - scaled) > tolerance ? 'scaled' : null,
    Math.abs(lower - rigid) > tolerance ? 'rigid' : null,
  ].filter((bar) => bar !== null);
  if (wrong.length > 0) {
    throw new Error(
      `[scene-skin-two-skeletons] ${wrong.join(' and ')} bar off: drew ${upper}px and ${lower}px, ` +
        `CPU expects ${scaled}px and ${rigid}px`,
    );
  }
}

// The bar's skinned width in pixels, from the real CPU skinning path over that skeleton's own palette.
// Orthographic with the eye on the view axis, so a world width maps to a pixel width by one ratio.
function predictBarWidthPixels(skeleton: Readonly<Skeleton3D>, boundJoint: number, pixels: number): number {
  const positions = new Float32Array([-barHalfX, 0, 0, barHalfX, 0, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1]);
  const joints = new Float32Array([boundJoint, 0, 0, 0, boundJoint, 0, 0, 0]);
  const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const out = new Float32Array(positions.length);
  skinVertices(
    out,
    new Float32Array(normals.length),
    positions,
    normals,
    joints,
    weights,
    skeleton.jointMatrices,
    skeleton.normalMatrices,
  );
  return Math.round((Math.abs(out[3] - out[0]) / (halfWidth * 2)) * pixels);
}

// The largest number of lit pixels any single row in [rowStart, rowEnd) carries. A count rather than a
// contiguous span, so an antialiased edge cannot split one bar into two shorter runs.
function widestRow(bitmap: Readonly<Bitmap>, rowStart: number, rowEnd: number): number {
  let widest = 0;
  for (let row = rowStart; row < rowEnd; row++) {
    let count = 0;
    for (let column = 0; column < bitmap.width; column++) {
      if (getBitmapPixelLuminance(bitmap, column, row) > 200) count++;
    }
    if (count > widest) widest = count;
  }
  return widest;
}
