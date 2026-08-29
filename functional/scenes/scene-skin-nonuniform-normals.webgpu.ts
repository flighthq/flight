import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, registerWgpuGpuSkinning } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginWgpuFrame,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createNode3D,
  createOrthographicProjection,
  createSkeleton3D,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderStateFromCanvasElement,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  prepareScene3DSkinning,
  registerWgpuBlinnPhongMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  setVector3,
  skinVertices,
  submitWgpuRenderPass,
} from '@flighthq/sdk';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'On an 800×600 near-black field (about R10 G12 B16), two broad light-grey rectangular facets sit ' +
    'side by side across the middle, separated by a narrow central gap. A threefold horizontal scale ' +
    'makes each facet span roughly 300 px, with the left covering about x=63–363 and the right ' +
    'x=438–738; both extend about y=200–400. Directional shading makes the RIGHT facet clearly ' +
    'brighter than the left by at least a visible step, while both remain lit. The facets are not ' +
    'equal in brightness, the left does not outrank the right, and neither rectangle collapses to a ' +
    'narrow or black strip.',
);

// WebGPU mirror of scene-skin-nonuniform-normals.webgl — the CPU/GPU agreement check on the skinned-
// normal covector path, where it matters most: the WebGPU mesh draw reads the normal palette through a
// SEPARATE bind group and layout from the pose palette, so nothing declared in one place breaks loudly
// if the two drift apart. The package tests for that binding run against a mock device and cannot see a
// real validation or sampling error; this scene runs the actual pipeline.
//
// One joint carries scale (3, 1, 1), so its normal matrix is diag(1/3, 1, 1) against a pose matrix of
// diag(3, 1, 1). Two facets weighted to it carry authored shading normals chosen so the scale REVERSES
// their brightness order rather than merely rescaling it. `assertRender` predicts the order on the CPU
// through the real `skinVertices` path, from the same palette the draw uploaded, and requires the
// rendered pixels to agree; it also re-derives the reversal so the scene cannot decay into a non-trial.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderStateFromCanvasElement(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
});
registerWgpuBlinnPhongMaterial(state);
registerWgpuGpuSkinning(state);
const pipeline = createWgpuRenderEffectPipeline(state, {
  depth: 'depth-stencil',
  format: 'rgba16f',
  sampleCount: 1,
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;
registerWgpuFunctionalTarget(state, scale);

// Specular is black and shininess minimal so sampled luminance tracks the diffuse term monotonically —
// the scene assertion compares an ORDER, which only survives if a highlight cannot outrank the Lambert result.
const material = createBlinnPhongMaterial({ diffuse: 0xc8ccd4ff, shininess: 1, specular: 0x000000ff });
const scene = createScene3D().root;

const facetNormals = [
  [1, 0, 5],
  [5, 0, 1],
];
const facetCenterX = [-1.5, 1.5];
const quadX: readonly (readonly [number, number])[] = [
  [-0.9, -0.1],
  [0.1, 0.9],
];
const vertices = new Float32Array(2 * 4 * 20);
const indices: number[] = [];
for (let facet = 0; facet < 2; facet++) {
  const [x0, x1] = quadX[facet];
  const cornerX = [x0, x1, x1, x0];
  const cornerY = [-0.8, -0.8, 0.8, 0.8];
  for (let corner = 0; corner < 4; corner++) {
    const offset = (facet * 4 + corner) * 20;
    vertices[offset] = cornerX[corner];
    vertices[offset + 1] = cornerY[corner];
    vertices[offset + 3] = facetNormals[facet][0];
    vertices[offset + 4] = facetNormals[facet][1];
    vertices[offset + 5] = facetNormals[facet][2];
    vertices[offset + 6] = 1;
    vertices[offset + 12] = 1;
    vertices[offset + 16] = 1;
  }
  const base = facet * 4;
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const root = createNode3D();
const scaled = createNode3D();
addNodeChild(root, scaled);
const skeleton = createSkeleton3D([root, scaled]);
setVector3(scaled.scale, 3, 1, 1);
invalidateNodeLocalTransform(scaled);
addNodeChild(scene, root);

const geometry = createMeshGeometry({
  indices: new Uint16Array(indices),
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const mesh = createMesh(geometry, [material]);
mesh.skin = { skeleton };
addNodeChild(scene, mesh);

// Orthographic so a world x maps to a pixel column by a fixed ratio, with no perspective term to
// re-derive in the scene assertion. halfWidth/halfHeight hold the 4:3 canvas aspect.
const halfWidth = 3.2;
const halfHeight = 2.4;
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight, halfWidth }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 6), createVector3(0, 0, 0), createVector3(0, 1, 0));

// The sun travels toward -x/-z, so the direction TOWARD the light is (+0.707, 0, +0.707) — the vector
// the scene assertion dots its CPU-predicted normals against.
const lightTravel = createVector3(-Math.SQRT1_2, 0, -Math.SQRT1_2);
const lights = {
  ambient: createAmbientLight({ color: 0x404858ff, intensity: 0.1 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: lightTravel,
    intensity: 1,
  }),
};

prepareScene3DSkinning(scene);
prepareScene3DRender(state, scene, camera, lights);
beginWgpuFrame(state);
renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
drawWgpuScene3D(state, scene, camera, lights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const correct = predictFacetDiffuse(skeleton.normalMatrices);
  // The same defect the covector fix removed: the pose matrix standing in for the normal matrix.
  const defect = predictFacetDiffuse(packPoseAsNormalPalette(skeleton.jointMatrices));
  if (correct[0] < correct[1] === defect[0] < defect[1]) {
    throw new Error(
      `[scene-skin-nonuniform-normals] not a trial: correct ${correct.map(format)} and pose-matrix ` +
        `${defect.map(format)} order the facets the same way, so the render cannot distinguish them`,
    );
  }

  const row = Math.floor(bitmap.height / 2);
  const sampled = facetCenterX.map((x) =>
    getBitmapPixelLuminance(bitmap, Math.floor(((x / halfWidth) * 0.5 + 0.5) * bitmap.width), row),
  );
  // A render where neither facet is lit would order two ambient samples by noise. Reject it before
  // reading anything into the comparison.
  if (Math.max(sampled[0], sampled[1]) <= 48) {
    throw new Error(`[scene-skin-nonuniform-normals] facets are unlit (${sampled.join(', ')})`);
  }
  if (Math.abs(sampled[0] - sampled[1]) < 8) {
    throw new Error(`[scene-skin-nonuniform-normals] facets are indistinguishable (${sampled.join(', ')})`);
  }
  if (sampled[0] < sampled[1] !== correct[0] < correct[1]) {
    throw new Error(
      `[scene-skin-nonuniform-normals] rendered ${sampled.join(', ')} contradicts CPU ` +
        `${correct.map(format)} — the GPU is not skinning normals with the palette the CPU computed`,
    );
  }
}

function format(value: number): string {
  return value.toFixed(4);
}

// The pose matrix rewritten into the padded 12-float normal-palette layout (three vec4 columns), which
// is what the shader would sample if the two palettes were confused for one another.
function packPoseAsNormalPalette(jointMatrices: Readonly<Float32Array>): Float32Array {
  const jointCount = (jointMatrices.length / 16) | 0;
  const out = new Float32Array(jointCount * 12);
  for (let joint = 0; joint < jointCount; joint++) {
    for (let column = 0; column < 3; column++) {
      out[joint * 12 + column * 4] = jointMatrices[joint * 16 + column * 4];
      out[joint * 12 + column * 4 + 1] = jointMatrices[joint * 16 + column * 4 + 1];
      out[joint * 12 + column * 4 + 2] = jointMatrices[joint * 16 + column * 4 + 2];
    }
  }
  return out;
}

// The diffuse term each facet should reach, skinned on the CPU by the real `skinVertices` path from the
// palette the draw just uploaded — one sample per facet, since every vertex of a facet shares a normal.
function predictFacetDiffuse(normalMatrices: Readonly<Float32Array>): readonly number[] {
  const positions = new Float32Array(2 * 3);
  const normals = new Float32Array([...facetNormals[0], ...facetNormals[1]]);
  const joints = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const outNormals = new Float32Array(normals.length);
  skinVertices(
    new Float32Array(positions.length),
    outNormals,
    positions,
    normals,
    joints,
    weights,
    skeleton.jointMatrices,
    normalMatrices,
  );
  const toLight = [-lightTravel.x, -lightTravel.y, -lightTravel.z];
  return [0, 1].map((facet) => {
    const x = outNormals[facet * 3];
    const y = outNormals[facet * 3 + 1];
    const z = outNormals[facet * 3 + 2];
    const length = Math.hypot(x, y, z);
    return Math.max(0, (x * toLight[0] + y * toLight[1] + z * toLight[2]) / length);
  });
}
