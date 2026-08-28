import { enableHostWebWgpuRenderSurface } from '@flighthq/host-web';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D, drawWgpuScene3DShadowMap, registerWgpuGpuSkinning } from '@flighthq/scene3d-wgpu';
import type { Bitmap } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  beginWgpuFrame,
  beginWgpuRenderEffectPipeline,
  configureDirectionalShadowCamera3D,
  createAabb,
  createAmbientLight,
  createBlinnPhongMaterial,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createNode3D,
  createOrthographicProjection,
  createPlaneMeshGeometry,
  createSkeleton3D,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelLuminance,
  getNode3DWorldBounds,
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
  'On an 800×600 view of a medium-grey ground plane, a bright horizontal bar floats above the ' +
    'horizon and casts a centred dark horizontal shadow directly below it. A threefold joint scale ' +
    'makes both bar and shadow approximately 617 px wide, derived from the 5.4-world-unit bar across ' +
    'a 7-world-unit orthographic view mapped to 800 px; their widths agree within edge filtering. ' +
    'Neither silhouette is the 206 px bind-pose width or the 69 px inverse-scale width. Lit ground ' +
    'remains visible at both ends of the shadow, and the bar and shadow stay vertically separate.',
);

// WebGPU mirror of shadow-skin-nonuniform.webgl, and the backend the check exists for: here the mesh
// draw and the shadow depth draw reach the palette through SEPARATE bind groups and layouts, so the
// two can drift apart with nothing shared to break loudly. The package tests for those bindings run
// against a mock device and cannot see a real validation or sampling fault; this scene runs the
// actual pipelines and compares what the two passes drew.
//
// shadow-skinning already proves the depth pass is not stuck at the bind pose. It cannot prove the two
// passes AGREE: it compares the shadow against fixed probe coordinates rather than against the mesh.
// Here a joint carries scale (3, 1, 1), which separates the candidates by a factor of three or nine —
// the pose palette stretches the bar to 3x, the bind pose leaves it at 1x, and the normal palette
// (diag(1/3, 1, 1)) would shrink it to 1/3.
//
// A horizontal bar floats above a ground plane under a straight-down sun, so its shadow is its own XZ
// footprint directly below. The camera is ORTHOGRAPHIC with world +x along screen +x, which makes a
// horizontal world width map to a pixel width by one fixed ratio at any depth — so the bar's pixel
// width and its shadow's pixel width are directly comparable, and both are compared against the width
// the CPU predicts from `skinVertices`. Three-way agreement: a defect that moved both GPU passes the
// same way would still part company with the CPU.
const pixelRatio = window.devicePixelRatio || 1;
enableHostWebWgpuRenderSurface();
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, {
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

// The bar reads brighter than the ground so a row scan can tell the two apart by luminance alone.
const barMaterial = createBlinnPhongMaterial({ diffuse: 0xffffffff, shininess: 1, specular: 0x000000ff });
const groundMaterial = createBlinnPhongMaterial({ diffuse: 0x6a6e76ff, shininess: 1, specular: 0x000000ff });
const scene = createScene3D().root;
addNodeChild(scene, createMesh(createPlaneMeshGeometry(8, 8), [groundMaterial]));

const barHalfX = 0.9;
const barHalfZ = 0.4;
const barY = 2;
const cornerX = [-barHalfX, barHalfX, barHalfX, -barHalfX];
const cornerZ = [-barHalfZ, -barHalfZ, barHalfZ, barHalfZ];
const vertices = new Float32Array(4 * 20);
for (let corner = 0; corner < 4; corner++) {
  const offset = corner * 20;
  vertices[offset] = cornerX[corner];
  vertices[offset + 1] = barY;
  vertices[offset + 2] = cornerZ[corner];
  vertices[offset + 4] = 1;
  vertices[offset + 6] = 1;
  vertices[offset + 12] = 1;
  vertices[offset + 16] = 1;
}

const root = createNode3D();
const scaled = createNode3D();
addNodeChild(root, scaled);
const skeleton = createSkeleton3D([root, scaled]);
setVector3(scaled.scale, 3, 1, 1);
invalidateNodeLocalTransform(scaled);
addNodeChild(scene, root);

const geometry = createMeshGeometry({
  // Both windings. The shadow camera looks straight down the light while the view camera looks in from
  // the front, so a one-sided quad is culled by whichever pass sees its back — and the material's
  // doubleSided flag does not reach the depth pipeline, so a single winding makes the two passes
  // disagree about whether the bar exists at all. This scene compares those two passes; it cannot let a
  // face-culling rule decide the comparison.
  indices: new Uint16Array([0, 2, 1, 0, 3, 2, 0, 1, 2, 0, 2, 3]),
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});
const mesh = createMesh(geometry, [barMaterial]);
mesh.skin = { skeleton };
addNodeChild(scene, mesh);

// Orthographic, with the eye in the YZ plane so the camera's right axis is world +x — that is what
// makes a world width and a pixel width proportional by one constant the scene assertion can re-derive.
// The ground plane is 8 wide and the view only 7, so the plane overhangs the frame on both sides and
// every scanned row is ground edge to edge — no frame boundary can masquerade as a silhouette edge.
const halfWidth = 3.5;
const halfHeight = 2.625;
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight, halfWidth }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 6, 8), createVector3(0, 1, 0), createVector3(0, 1, 0));

const lightTravel = createVector3(0, -1, 0);
const lights = {
  ambient: createAmbientLight({ color: 0x404858ff, intensity: 0.1 }),
  directional: createDirectionalLight({
    castsShadow: true,
    color: 0xffffffff,
    direction: lightTravel,
    intensity: 1,
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
configureDirectionalShadowCamera3D(shadowCamera, lightTravel, sceneBounds);

prepareScene3DRender(state, scene, camera, lights);
beginWgpuFrame(state);
drawWgpuScene3DShadowMap(state, scene, shadowCamera, lights.directional);
renderWgpuBackground(state);
beginWgpuRenderEffectPipeline(state, pipeline, 'linear');
drawWgpuScene3D(state, scene, camera, lights);
endWgpuRenderEffectPipeline(state, pipeline, []);
submitWgpuRenderPass(state);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const predicted = (predictSkinnedBarWidth() / (halfWidth * 2)) * bitmap.width;
  // The bar sits above the horizon and its shadow below it, so each row scan owns half the frame and
  // neither can pick up the other. Widest row wins: it is the one crossing the shape's full extent.
  const barPixels = widestRow(bitmap, 0, Math.floor(bitmap.height * 0.45), (value) => value > 200);
  // A shadow is dark ground BOUNDED BY LIT GROUND. Requiring both row edges to be lit is what keeps the
  // scan off the rows past the plane's front edge, where the dark background would read as a full-width
  // shadow — a bound on what the measurement means, not a hand-fitted row range.
  const shadowPixels = widestRow(
    bitmap,
    Math.floor(bitmap.height * 0.55),
    bitmap.height,
    (value) => value < 40,
    (row) =>
      getBitmapPixelLuminance(bitmap, 0, row) > 60 && getBitmapPixelLuminance(bitmap, bitmap.width - 1, row) > 60,
  );

  if (barPixels === 0 || shadowPixels === 0) {
    throw new Error(`[shadow-skin-nonuniform] nothing to measure: bar ${barPixels}px, shadow ${shadowPixels}px`);
  }
  // A bind-pose shadow is a THIRD of this and the normal palette a NINTH, so the tolerance below rejects
  // both by a wide margin while absorbing shadow-map filtering at the silhouette edge.
  const tolerance = 16;
  // Both passes are reported whichever one is at fault. Which of the two moved is the whole diagnosis —
  // a message naming only the first failure would leave "did the other pass move with it?" unanswered,
  // and that is the question separating a bad palette from a bad pass.
  const wrong = [
    Math.abs(barPixels - predicted) > tolerance ? 'mesh' : null,
    Math.abs(shadowPixels - predicted) > tolerance ? 'shadow' : null,
  ].filter((pass) => pass !== null);
  if (wrong.length > 0) {
    throw new Error(
      `[shadow-skin-nonuniform] ${wrong.join(' and ')} pass off the CPU prediction: mesh ${barPixels}px, ` +
        `shadow ${shadowPixels}px, CPU predicts ${predicted.toFixed(1)}px`,
    );
  }
}

// The bar's skinned world width, from the real CPU skinning path over the same palette the draw
// uploaded. Only x matters: the sun is straight down, so the shadow is the bar's own x extent.
function predictSkinnedBarWidth(): number {
  const positions = new Float32Array([-barHalfX, barY, 0, barHalfX, barY, 0]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0]);
  const joints = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const weights = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]);
  const outPositions = new Float32Array(positions.length);
  skinVertices(
    outPositions,
    new Float32Array(normals.length),
    positions,
    normals,
    joints,
    weights,
    skeleton.jointMatrices,
    skeleton.normalMatrices,
  );
  return Math.abs(outPositions[3] - outPositions[0]);
}

// The largest number of pixels any single row in [rowStart, rowEnd) matches. A count rather than a
// contiguous span, so a filtered silhouette edge cannot split one shape into two shorter runs.
function widestRow(
  bitmap: Readonly<Bitmap>,
  rowStart: number,
  rowEnd: number,
  matches: (luminance: number) => boolean,
  rowAllows: (row: number) => boolean = () => true,
): number {
  let widest = 0;
  for (let row = rowStart; row < rowEnd; row++) {
    if (!rowAllows(row)) continue;
    let count = 0;
    for (let column = 0; column < bitmap.width; column++) {
      if (matches(getBitmapPixelLuminance(bitmap, column, row))) count++;
    }
    if (count > widest) widest = count;
  }
  return widest;
}
