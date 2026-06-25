// quadbatch-grid — validates the QuadBatch: many textured quads drawn from ONE atlas in a single batched node.
//
// A QuadBatch is the instanced-draw primitive behind tilemaps and particle systems: instead of one display
// object per quad, it stores parallel arrays — `ids` (which atlas region each quad uses) and `transforms`
// (where each quad goes) — and the renderer issues all of them under one node. This test exercises the
// `vector2` transform layout (stride 2: [x0,y0, x1,y1, ...]) with FOUR quads at four distinct local offsets,
// all referencing a single solid-blue region. It is visual on purpose: the oracle proves each of the four
// transform entries lands a quad at its expected position (blue), and that the spaces between them stay
// background — i.e. the batch draws discrete quads at the array's coordinates, not one filled span.
import type { Surface } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  createDisplayContainer,
  createImageResource,
  createQuadBatch,
  createRectangle,
  createTextureAtlas,
  getSurfacePixelRgb,
  invalidateNodeLocalTransform,
  QuadBatchKind,
  setQuadBatchLocalBoundsRectangle,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// One QUAD x QUAD solid-blue atlas region; the batch tiles it at four offsets.
const QUAD = 48;

// The QuadBatch node origin in logical space; quad transforms below are relative to it.
const BASE_X = 150;
const BASE_Y = 150;

// Four per-quad local offsets (vector2 layout): a 2x2 grid spaced well apart so gaps are clearly empty.
const OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [300, 0],
  [0, 250],
  [300, 250],
];

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA, low byte = alpha)
  kinds: [QuadBatchKind],
});

// Build a single solid-blue atlas region.
function makeBlueCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = QUAD;
  c.height = QUAD;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgb(0,0,255)';
  ctx.fillRect(0, 0, QUAD, QUAD);
  return c;
}

const atlas = createTextureAtlas({ image: createImageResource(makeBlueCanvas()) });
addTextureAtlasRegion(atlas, 0, 0, QUAD, QUAD); // region id 0 — blue

const root = createDisplayContainer();

const batch = createQuadBatch();
batch.data.atlas = atlas;
batch.data.transformType = 'vector2'; // stride 2: [x0,y0, x1,y1, ...]
batch.data.instanceCount = OFFSETS.length;
batch.data.ids = new Uint16Array(OFFSETS.map(() => 0)); // every quad uses region 0
batch.data.transforms = new Float32Array(OFFSETS.flatMap(([x, y]) => [x, y]));
batch.x = BASE_X;
batch.y = BASE_Y;

// The default QuadBatch bounds method copies from the runtime rect, so supply a local-bounds rect spanning
// every quad. Without it the update pass sees zero bounds and may cull the batch.
let maxX = 0;
let maxY = 0;
for (const [ox, oy] of OFFSETS) {
  maxX = Math.max(maxX, ox + QUAD);
  maxY = Math.max(maxY, oy + QUAD);
}
setQuadBatchLocalBoundsRectangle(batch, createRectangle(0, 0, maxX, maxY));

addNodeChild(root, batch);
invalidateNodeLocalTransform(batch);

render(root);

export function assertRender(frame: Readonly<Surface>): void {
  const s = frame.width / width; // device-pixel scale
  const at = (x: number, y: number): number => getSurfacePixelRgb(frame, Math.round(x * s), Math.round(y * s));

  // Each quad's screen position is BASE + offset; its center is offset + QUAD/2.
  for (let i = 0; i < OFFSETS.length; i++) {
    const [ox, oy] = OFFSETS[i];
    const cx = BASE_X + ox + QUAD / 2;
    const cy = BASE_Y + oy + QUAD / 2;
    const px = at(cx, cy);
    if (!isBlue(px)) {
      throw new Error(`[quadbatch-grid] quad ${i} center (${cx},${cy}) not blue — got #${hex(px)}`);
    }
  }

  // A point in the middle of the 2x2 grid falls between all four quads — must be background.
  const midX = BASE_X + 150 + QUAD / 2; // halfway across the 0->300 gap, offset by half a quad
  const midY = BASE_Y + 125 + QUAD / 2; // halfway down the 0->250 gap
  const center = at(midX, midY);
  if (!isBackground(center)) {
    throw new Error(`[quadbatch-grid] gap between quads not background — got #${hex(center)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}
function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 180 && channel(rgb, 16) < 90 && channel(rgb, 8) < 90;
}
function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}
