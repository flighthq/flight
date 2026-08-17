import { createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D } from '@flighthq/scene3d-gl';
import type {
  Bitmap,
  Camera3D,
  GlRenderEffectPipeline,
  Node3D,
  Scene3DLights,
  VertexAttributeLayout,
} from '@flighthq/sdk';
import {
  addNodeChild,
  beginGlRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createGlCanvasElement,
  createGlRenderEffectPipeline,
  createGlRenderState,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createScene3DLights,
  createVector3,
  createVertexColorMaterial,
  endGlRenderEffectPipeline,
  getBitmapPixelChannel,
  ImageChannel,
  prepareScene3DRender,
  registerGlVertexColorMaterial,
  renderGlBackground,
  setCamera3DViewMatrix4FromLookAt,
} from '@flighthq/sdk';

// drawGlScene3D exists on both scene-gl and scene-wgpu, so it collides in the @flighthq/sdk barrel
// (re-exported from both) and is unavailable there — import the Gl one directly from its package.

// Gl forward 3D column, wiring copied from material-vertex-color. The VertexColor renderer writes into
// the effect pipeline's rgba16f + depth scene target, then ends with an empty effect list to tone-present
// the scene straight to the canvas.
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createGlCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = createGlRenderState(canvas, {
  pixelRatio,
  backgroundColor: 0x0a0c10ff,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
registerGlVertexColorMaterial(state);

const pipeline: GlRenderEffectPipeline = createGlRenderEffectPipeline(state, {
  sampleCount: 4,
  format: 'rgba16f',
  depth: 'depth-stencil',
});

export const scale = pixelRatio;
export const width = 800;
export const height = 600;

export function render(scene: Readonly<Node3D>, camera: Readonly<Camera3D>, lights: Readonly<Scene3DLights>): void {
  beginGlRenderEffectPipeline(state, pipeline, 'linear');
  // renderGlBackground clears color; the depth attachment needs its own clear to the far plane (1.0)
  // or every fragment fails the LESS depth test against an uncleared (0) buffer and the scene is black.
  renderGlBackground(state);
  const gl = state.gl;
  gl.depthMask(true);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  prepareScene3DRender(state, scene, camera, lights);
  drawGlScene3D(state, scene, camera, lights);
  endGlRenderEffectPipeline(state, pipeline, []);
}

// BACKEND CAVEAT — scoped to WebGL, and the scoping is the finding rather than a convenience. The Wgpu
// mesh pipeline binds one fixed vertex buffer layout (arrayStride 48: position/normal/tangent/uv0), so
// the stride-64 record below is not merely stripped of its color0 channel there: every vertex past the
// first is read 16 bytes early and the POSITIONS are wrong too. Rendering this geometry on Wgpu was
// measured, not inferred — it produces one solid white triangle, white because the default tint drives
// the surface alone and a triangle because the quad's fourth corner no longer lands where it belongs.
// A Wgpu variant of this scene would therefore assert against garbage. Which `<name>.<backend>.ts` files
// exist is how a scene declares the backends it is valid on; the Wgpu absence is carried instead as a
// DECLARED_GAPS row in scripts/support.ts, which is what a consumer asking "does per-vertex color work on
// WebGPU" reads.
//
// material-vertex-color-interpolated — proves a VertexColorMaterial mesh whose geometry CARRIES a color0
// attribute rasterizes INTERPOLATED per-vertex color across the surface. Its sibling
// material-vertex-color deliberately uses geometry WITHOUT color0, to prove the material is
// lighting-independent, and so cannot speak to interpolation at all: with no color0 channel the Gl
// renderer defaults the attribute to opaque white and the tint alone drives the surface — which is
// exactly what a backend with no color0 support also produces. Carrying color0 is the only thing that
// separates those two, which is why this scene sits next to that one rather than replacing it.
//
// The unlit shader computes `color = u_color * v_color0`, so the material tint stays at its default
// white: any other tint would multiply into every sample and mute the corner hues the assertion reads.
const logicalWidth = width / scale;
const logicalHeight = height / scale;

// The canonical 48-byte PBR record extended with color0 at byte 48 — the layout a color0-carrying glTF
// mesh imports as. Declared here rather than in @flighthq/mesh because a shared
// CANONICAL_VERTEX_COLOR_MESH_GEOMETRY_LAYOUT constant would be a cross-package addition, not a fixture.
const vertexColorLayout: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
    { byteOffset: 48, format: 'float32x4', semantic: 'color0' },
  ],
  stride: 64,
};

// A camera-facing quad, one saturated color per corner, wound counter-clockwise from +z so it is
// front-facing under the default cull. Four DIFFERENT hues (rather than one color plus black) so a
// surface that lost color0 cannot land on any of them: dropping the channel yields a single flat white
// quad, which no corner of this one is. Declared here rather than with the other module constants at the
// bottom of the file because the geometry below consumes them during module init.
// prettier-ignore
const quadVertices = new Float32Array([
  // position           normal     tangent      uv0     color0
  -1.0, -0.75, 0,    0, 0, 1,   1, 0, 0, 1,   0, 1,   1, 0, 0, 1, // bottom-left  RED
   1.0, -0.75, 0,    0, 0, 1,   1, 0, 0, 1,   1, 1,   0, 1, 0, 1, // bottom-right GREEN
   1.0,  0.75, 0,    0, 0, 1,   1, 0, 0, 1,   1, 0,   0, 0, 1, 1, // top-right    BLUE
  -1.0,  0.75, 0,    0, 0, 1,   1, 0, 0, 1,   0, 0,   1, 1, 0, 1, // top-left     YELLOW
]);
const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const geometry = createMeshGeometry({
  indices: quadIndices,
  layout: vertexColorLayout,
  vertices: quadVertices,
});

// Default tint (opaque white) so color0 alone drives the surface — see the note above.
const material = createVertexColorMaterial();

const scene = createScene3D().root;
addNodeChild(scene, createMesh(geometry, [material]));

// Perspective camera dead-on the quad from +z. At fovY 45° from z = 3 the visible half-height at z = 0
// is 3·tan(22.5°) ≈ 1.243, so the 2 × 1.5 quad covers the middle ~60% of the frame on both axes and the
// four corner samples land well inside it.
const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: logicalWidth / logicalHeight, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 3), createVector3(0, 0, 0), createVector3(0, 1, 0));

// VertexColor is lighting-independent — material-vertex-color is the scene that proves that. This rig
// exists only because the draw call takes one.
const lights = createScene3DLights({ ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }) });

render(scene, camera, lights);

// Oracle: the four corner samples must be MUTUALLY DISTINCT, and each must carry its own corner's
// channels above the ones it does not. Both halves matter. Distinctness is the property a surface driven
// by a single flat color cannot have, so it fails exactly when per-vertex color stops reaching the
// fragment — the failure this scene exists for. Per-corner channel ordering pins the interpolation to the
// right vertices, so a surface that varies for some other reason (a lighting gradient leaking in, a
// mirrored UV, a shuffled index buffer) cannot satisfy it by accident.
export function assertRender(bitmap: Readonly<Bitmap>): void {
  const samples = CORNERS.map((corner) => {
    const x = Math.floor(bitmap.width * corner.u);
    const y = Math.floor(bitmap.height * corner.v);
    return {
      blue: getBitmapPixelChannel(bitmap, x, y, ImageChannel.Blue),
      corner: corner,
      green: getBitmapPixelChannel(bitmap, x, y, ImageChannel.Green),
      red: getBitmapPixelChannel(bitmap, x, y, ImageChannel.Red),
    };
  });

  for (const sample of samples) {
    const rgb = `${sample.red},${sample.green},${sample.blue}`;
    if (sample.red < 24 && sample.green < 24 && sample.blue < 24) {
      throw new Error(
        `[material-vertex-color-interpolated] ${sample.corner.name} corner is unlit (${rgb}) — the quad did not render`,
      );
    }
    for (const high of sample.corner.high) {
      for (const low of sample.corner.low) {
        if (sample[high] - sample[low] < CHANNEL_MARGIN) {
          throw new Error(
            `[material-vertex-color-interpolated] ${sample.corner.name} corner reads (${rgb}) — ${high} does not lead ` +
              `${low}, so per-vertex color is not interpolating to the right vertices`,
          );
        }
      }
    }
  }

  // Mutual distinctness: every pair of corners must differ. A surface driven by the tint alone (no color0
  // reaching the fragment) is one flat color everywhere, and every pair here collapses to ~0.
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i];
      const b = samples[j];
      const distance = Math.abs(a.red - b.red) + Math.abs(a.green - b.green) + Math.abs(a.blue - b.blue);
      if (distance < DISTINCTNESS_MARGIN) {
        throw new Error(
          `[material-vertex-color-interpolated] ${a.corner.name} (${a.red},${a.green},${a.blue}) and ` +
            `${b.corner.name} (${b.red},${b.green},${b.blue}) are the same color — the surface is FLAT, so color0 ` +
            `is not reaching the fragment (the exact symptom of a backend with no color0 vertex slot)`,
        );
      }
    }
  }
}

// Sample points as a fraction of the frame, inset from each quad corner toward the center so
// rasterization and antialiasing at the silhouette edge cannot reach them. `high`/`low` are the channels
// that corner's color does and does not carry; YELLOW carries both red and green, so neither faults the
// other.
const CORNERS: readonly Readonly<{
  high: readonly ('blue' | 'green' | 'red')[];
  low: readonly ('blue' | 'green' | 'red')[];
  name: string;
  u: number;
  v: number;
}>[] = [
  { high: ['red'], low: ['blue', 'green'], name: 'bottom-left RED', u: 0.28, v: 0.72 },
  { high: ['green'], low: ['blue', 'red'], name: 'bottom-right GREEN', u: 0.72, v: 0.72 },
  { high: ['blue'], low: ['green', 'red'], name: 'top-right BLUE', u: 0.72, v: 0.28 },
  { high: ['green', 'red'], low: ['blue'], name: 'top-left YELLOW', u: 0.28, v: 0.28 },
];

// At these sample points the smallest legitimate lead is ~0.6 of full range in linear space, so a margin
// of 40/255 clears rasterizer and tone-present rounding by a wide factor while still collapsing to a
// failure the moment the surface goes flat.
const CHANNEL_MARGIN = 40;
const DISTINCTNESS_MARGIN = 60;
