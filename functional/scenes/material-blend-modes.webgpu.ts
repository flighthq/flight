import { logInfo } from '@flighthq/log';
import { createScene3D } from '@flighthq/scene3d';
import { drawWgpuScene3D } from '@flighthq/scene3d-wgpu';
import type { Camera3D, Scene3DLights, Node3D, Bitmap } from '@flighthq/sdk';
import {
  createScene3DLights,
  addNodeChild,
  beginWgpuRenderEffectPipeline,
  createAmbientLight,
  createCamera3D,
  createDirectionalLight,
  createMesh,
  createOrthographicProjection,
  createQuadMeshGeometry,
  createUnlitMaterial,
  createVector3,
  createWgpuCanvasElement,
  createWgpuRenderEffectPipeline,
  createWgpuRenderState,
  endWgpuRenderEffectPipeline,
  getBitmapPixelChannel,
  ImageChannel,
  invalidateNodeLocalTransform,
  prepareScene3DRender,
  registerWgpuUnlitMaterial,
  renderWgpuBackground,
  setCamera3DViewMatrix4FromLookAt,
  submitWgpuRenderPass,
  BlendMode,
} from '@flighthq/sdk';
import { declareExpectedImageDescription } from '@ft/render';
import { registerWgpuFunctionalTarget } from '@ft/verify';

declareExpectedImageDescription(
  'An 800x600 frame filled edge to edge by ONE flat mid-grey backdrop — an unlit 0x808080 quad 9x7 world units ' +
    'across an 8x6 orthographic view, so no background shows anywhere — carrying a grid of SIX COLUMNS by THREE ' +
    'ROWS of 110x110 px patches. The columns are centred at x = 66.7, 200, 333.3, 466.7, 600 and 733.3 px (pitch ' +
    '133.3 px, leaving about 23 px of bare backdrop between neighbours) and run in this reading order: normal, ' +
    'add, multiply, screen, darken, lighten. The rows are centred at y = 120, 300 and 480 px and hold the SAME ' +
    'patch colour (0xff8040, a saturated orange) at full opacity, quarter opacity and zero opacity from top to ' +
    'bottom. In the TOP row, composited against the grey: normal shows the orange itself; add and screen are both ' +
    'clearly lighter than the backdrop; multiply is clearly darker, a dark brown; darken is a khaki grey ' +
    '(per-channel min against the grey); lighten is a salmon (per-channel max). In the MIDDLE row each patch sits ' +
    'visibly between the backdrop and its full-opacity twin — a quarter-opacity patch that MATCHES its ' +
    'full-opacity twin is the failure this scene exists to catch, because identical rows are exactly what happens ' +
    'when coverage never reaches the composite. The multiply and darken columns are the exception and may look ' +
    'alike across those two rows at this patch colour; that is a property of those operators, not a defect. The ' +
    'BOTTOM row is deliberately NOT uniform, and this is the part a description must not quietly omit: in the ' +
    'normal, add, multiply and screen columns the zero-opacity patch is invisible and the backdrop passes through ' +
    'untouched, so that stretch reads as unbroken grey — but the DARKEN column instead shows a solid BLACK ' +
    '110x110 px square centred at (600,480). That square is a known and recorded fixed-function limitation rather ' +
    'than a defect to report: Darken realizes as MIN with ONE/ONE factors, which cannot carry the coverage term, ' +
    'so a fully transparent source computes min(0, dst) = 0 and wipes the backdrop to black. Lighten realizes as ' +
    'MAX with the same factors, where max(0, dst) = dst, so its zero-opacity cell is invisible like the first ' +
    'four. Bounded, with the reason stated: the assertion samples the RED CHANNEL only, at one point per cell, ' +
    'and compares ordinals — coverage separation in normal/add/screen/lighten, the zero-coverage no-op in ' +
    'normal/add/multiply/screen, Multiply directionally (never brighter than the backdrop) and Normal by ' +
    'bracketing between backdrop and full. It does NOT check Darken at any row, Lighten at zero coverage, or any ' +
    'absolute level, and the black square above is exactly the cell that scope excludes. Exact levels are not ' +
    'derivable here at all: the scene renders through an HDR rgba16f target and is tone-presented, so magnitudes ' +
    'are backend- and curve-dependent while every ordering described above is not.',
);
const pixelRatio = window.devicePixelRatio || 1;
const canvas = createWgpuCanvasElement(800, 600, pixelRatio);
document.body.appendChild(canvas);

export const state = await createWgpuRenderState(canvas, { pixelRatio, backgroundColor: 0x101014ff });
registerWgpuUnlitMaterial(state);

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

// material-blend-modes — the SurfaceMaterial `blendMode` path on the 3D forward renderers, which had no
// functional coverage at all (the existing node-blend-modes scenes are the 2D node property, a different
// path). Six blend modes across the columns, each drawn TWICE over one opaque backdrop: the top row at
// full alpha and the bottom row at quarter alpha, same RGB. Alpha is the only variable, so each column
// is a direct read of whether coverage reaches the composite.
//
// A built-in material's fragment tail emits PREMULTIPLIED color (rgb scaled by the coverage it writes
// to a — see WGPU_MESH_FRAGMENT_TAIL), matching every equation in the premultiplied blend table. The
// scene is built so that mismatch is visible rather than subtle, and the assertion checks the three
// columns where correct and incorrect are unambiguous and survive tone-mapping:
//
//   COVERAGE (Normal, Add, Screen, Lighten) — a quarter-alpha patch cannot land on the same value as
//              the fully-opaque one. When coverage never reaches the composite the two rows are
//              pixel-identical, which is precisely the defect's signature.
//   Normal   — additionally directional, and the control: Normal is the one mode wired to a
//              straight-alpha table today, so its quarter-alpha patch must already sit strictly between
//              the backdrop and the full-alpha patch, and must stay there.
//   Multiply — directional rather than differential. Multiplying can only darken, so a quarter-alpha
//              patch must not be BRIGHTER than the backdrop; one that brightens is coverage arriving
//              un-applied.
//
// DARKEN is rendered but not asserted, and Multiply is asserted directionally rather than by difference,
// for the same reason: at this patch color (red at full scale) `min(c*a, dst)` and `dst*(c*a) + dst*(1-a)`
// both collapse to the destination at BOTH alphas, so "the rows must differ" is not a true statement about
// a correct renderer — it would fail against a correct fix. That is a property of those operators, not a
// limitation of the harness. Both columns still render, so the frame fingerprint guards them.
//
// Assertions are ORDINAL (comparisons between sampled patches), never absolute pixel values: the scene
// renders through an HDR rgba16f target and is tone-presented, so magnitudes are backend- and
// curve-dependent while the orderings above are not.
//
// Deliberately does NOT set `alphaType` on any material. These are built-in materials whose tails always
// emit straight coverage, so the scene reads the default and stays valid however that declaration is
// spelled — or whether it exists on SurfaceMaterial at all.

// Orthographic so world coordinates map linearly to the frame and the sample points below are exact
// fractions of the image rather than a perspective divide the assertion would have to re-derive.
const HALF_WIDTH = 4;
const HALF_HEIGHT = 3;

// Column order is the reading order of the assertion, not the enum's.
const COLUMNS: readonly BlendMode[] = [
  BlendMode.Normal,
  BlendMode.Add,
  BlendMode.Multiply,
  BlendMode.Screen,
  BlendMode.Darken,
  BlendMode.Lighten,
];

const COLUMN_NORMAL = 0;
const COLUMN_ADD = 1;
const COLUMN_MULTIPLY = 2;
const COLUMN_SCREEN = 3;
const COLUMN_LIGHTEN = 5;

// The columns whose operator genuinely separates a quarter-alpha patch from a fully-opaque one at this
// patch color, and so can carry the "coverage reached the composite" assertion. Multiply and Darken are
// excluded on purpose — see the header.
const COVERAGE_COLUMNS: readonly number[] = [COLUMN_NORMAL, COLUMN_ADD, COLUMN_SCREEN, COLUMN_LIGHTEN];

// The modes whose fixed-function realization is EXACT under partial coverage, and so must leave the
// destination untouched at zero alpha. Darken and Lighten are absent because MIN/MAX provably cannot
// express `(1-a)*dst + a*B(src,dst)` — see DEFAULT_GL_BLEND_MODES.
const ZERO_COVERAGE_COLUMNS: readonly number[] = [COLUMN_NORMAL, COLUMN_ADD, COLUMN_MULTIPLY, COLUMN_SCREEN];

// Readback margin separating a real coverage difference from tone-mapping and MSAA noise. The real
// post-fix differences are an order of magnitude larger; today they are exactly zero.
const COVERAGE_MARGIN = 12;

// Patch RGB. Red is full-scale so the red channel the assertion samples carries the cleanest signal;
// green/blue only make the columns legible in the screenshot.
const PATCH_RGB = 0xff8040;
const FULL_ALPHA = 0xff;
const QUARTER_ALPHA = 0x40;
const ZERO_ALPHA = 0x00;

// World-space row centers: full-alpha above the midline, quarter-alpha below.
const FULL_ROW_Y = 1.8;
const QUARTER_ROW_Y = 0;
const ZERO_ROW_Y = -1.8;

const scene = createScene3D().root;

// Opaque mid-gray backdrop, larger than the view. It is the destination every patch composites against,
// and it draws in the opaque pass ahead of every blended patch regardless of scene order.
const backdrop = createMesh(createQuadMeshGeometry(HALF_WIDTH * 2 + 1, HALF_HEIGHT * 2 + 1), [
  createUnlitMaterial({ baseColor: 0x808080ff }),
]);
backdrop.position.z = -1;
invalidateNodeLocalTransform(backdrop);
addNodeChild(scene, backdrop);

const patchGeometry = createQuadMeshGeometry(1.1, 1.1);
for (let column = 0; column < COLUMNS.length; column++) {
  addPatch(column, FULL_ROW_Y, FULL_ALPHA);
  addPatch(column, QUARTER_ROW_Y, QUARTER_ALPHA);
  addPatch(column, ZERO_ROW_Y, ZERO_ALPHA);
}

const camera = createCamera3D({
  far: 100,
  near: 0.1,
  projection: createOrthographicProjection({ halfHeight: HALF_HEIGHT, halfWidth: HALF_WIDTH }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Unlit materials ignore lights entirely; the block is required by the draw signature.
const lights = createScene3DLights({
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: createVector3(0, 0, -1), intensity: 0 }),
});

render(scene, camera, lights);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  assertBlendModeCoverage(bitmap, '[material-blend-modes/webgpu]');
}

// Shared, backend-independent assertion body. Duplicated verbatim in the .webgl.ts sibling because
// functional scenes are self-contained per backend by design.
function assertBlendModeCoverage(bitmap: Readonly<Bitmap>, tag: string): void {
  const backdrop = sampleRed(bitmap, 0.5, backdropRowFraction());
  const full = COLUMNS.map((_, column) => sampleRed(bitmap, columnFraction(column), fullRowFraction()));
  const quarter = COLUMNS.map((_, column) => sampleRed(bitmap, columnFraction(column), quarterRowFraction()));
  const zero = COLUMNS.map((_, column) => sampleRed(bitmap, columnFraction(column), zeroRowFraction()));

  // Every sampled value, so a failure report shows the whole grid rather than only the first inequality
  // that tripped. Lands in logs.jsonl next to the screenshot.
  logInfo({ backdrop, full, quarter, zero }, 'test');

  // Guards the guard: if the backdrop or the patches did not render at all, every comparison below would
  // be between two blanks and would pass vacuously.
  if (backdrop <= 20) {
    throw new Error(`${tag} backdrop did not render (red ${backdrop})`);
  }
  if (full[COLUMN_ADD] <= backdrop + 10) {
    throw new Error(
      `${tag} full-alpha additive patch did not brighten the backdrop (${full[COLUMN_ADD]} vs ${backdrop})`,
    );
  }

  for (const column of COVERAGE_COLUMNS) {
    if (quarter[column] >= full[column] - COVERAGE_MARGIN) {
      throw new Error(
        `${tag} ${COLUMNS[column]} ignored coverage: the quarter-alpha patch (${quarter[column]}) is not ` +
          `clearly dimmer than the full-alpha patch (${full[column]}). A straight-alpha tail composited by ` +
          `a premultiplied equation contributes at full strength regardless of alpha.`,
      );
    }
  }

  if (!(quarter[COLUMN_NORMAL] > backdrop + 5 && quarter[COLUMN_NORMAL] < full[COLUMN_NORMAL] - 5)) {
    throw new Error(
      `${tag} Normal quarter-alpha patch is not between the backdrop and the full-alpha patch ` +
        `(backdrop ${backdrop}, quarter ${quarter[COLUMN_NORMAL]}, full ${full[COLUMN_NORMAL]})`,
    );
  }

  // Zero coverage must be a no-op: `(1-0)*dst + 0*B(src,dst)` is the destination, whatever B is. The
  // four modes asserted here express that exactly in fixed-function form. DARKEN AND LIGHTEN ARE
  // EXCLUDED AND KNOWN WRONG — MIN/MAX cannot carry the coverage term, so Darken computes min(0, dst)
  // and wipes the backdrop to black. That is recorded here rather than left invisible; the coverage-
  // correct pair lives in AdvancedBlendMode and realizes through a BlendEffect. Assert them here only
  // once the enum members route through that path.
  for (const column of ZERO_COVERAGE_COLUMNS) {
    if (Math.abs(zero[column] - backdrop) > COVERAGE_MARGIN) {
      throw new Error(
        `${tag} ${COLUMNS[column]} changed the backdrop at ZERO coverage (${zero[column]} vs ${backdrop}). ` +
          `A fully transparent source must composite to the destination under every blend equation.`,
      );
    }
  }

  if (quarter[COLUMN_MULTIPLY] > backdrop + 10) {
    throw new Error(
      `${tag} Multiply brightened the backdrop: quarter-alpha patch ${quarter[COLUMN_MULTIPLY]} exceeds the ` +
        `backdrop ${backdrop}. Multiplying can only darken; a straight-alpha tail composited by a ` +
        `premultiplied Multiply adds an un-applied coverage term.`,
    );
  }
}

// A blended patch of `blendMode` at the given row, alpha carried in the material's base color.
function addPatch(column: number, y: number, alpha: number): void {
  const material = createUnlitMaterial({ baseColor: (((PATCH_RGB << 8) >>> 0) | alpha) >>> 0 });
  material.alphaMode = 'blend';
  material.blendMode = COLUMNS[column];
  const mesh = createMesh(patchGeometry, [material]);
  mesh.position.x = columnCenterX(column);
  mesh.position.y = y;
  invalidateNodeLocalTransform(mesh);
  addNodeChild(scene, mesh);
}

function columnCenterX(column: number): number {
  const pitch = (HALF_WIDTH * 2) / COLUMNS.length;
  return -HALF_WIDTH + pitch * (column + 0.5);
}

// World → frame fractions. Orthographic, so both axes are linear; y flips (world +y is up, image +y down).
function columnFraction(column: number): number {
  return (columnCenterX(column) + HALF_WIDTH) / (HALF_WIDTH * 2);
}

function fullRowFraction(): number {
  return (HALF_HEIGHT - FULL_ROW_Y) / (HALF_HEIGHT * 2);
}

function quarterRowFraction(): number {
  return (HALF_HEIGHT - QUARTER_ROW_Y) / (HALF_HEIGHT * 2);
}

function zeroRowFraction(): number {
  return (HALF_HEIGHT - ZERO_ROW_Y) / (HALF_HEIGHT * 2);
}

// Above the top row, where only the backdrop covers the frame.
function backdropRowFraction(): number {
  return (HALF_HEIGHT - 2.8) / (HALF_HEIGHT * 2);
}

function sampleRed(bitmap: Readonly<Bitmap>, xFraction: number, yFraction: number): number {
  const x = Math.floor(bitmap.width * xFraction);
  const y = Math.floor(bitmap.height * yFraction);
  return getBitmapPixelChannel(bitmap, x, y, ImageChannel.Red);
}
