// svg-import — establishes that the SVG document importer produces a display list that actually
// rasterizes. This is the FIRST render coverage createScene2DFromSvgDocument has ever had; before this
// scene, no functional scene and no example imported SVG at all, so every pixel the importer was
// responsible for was unverified outside jsdom unit tests.
//
// Deliberately narrow. One scene cannot cover an importer, and this one is not trying to: it exercises
// solid-filled rectangles and nothing else — no gradients, strokes, transforms, clips, masks, symbols,
// text, or images, all of which the importer supports and none of which are checked here. Read a pass as
// "the importer's output reaches the rasterizer," never as "SVG is covered."
//
// The two rects sit in OPPOSITE corners of the document box rather than side by side, so the scene assertion
// checks placement and not just presence: it samples both filled corners and both empty ones, which an
// axis flip or a collapsed transform would fail. Each is a distinct colour so a swap is caught too.
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
// So the importer's DOM output is asserted only to be non-empty.
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  invalidateNodeLocalTransform,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The imported document's own coordinate box, and where its origin lands on the canvas.
const DOC_WIDTH = 400;
const DOC_HEIGHT = 300;
const ORIGIN_X = 200;
const ORIGIN_Y = 150;
const HALF_WIDTH = DOC_WIDTH / 2;
const HALF_HEIGHT = DOC_HEIGHT / 2;

const SVG_SOURCE = `<svg width="${DOC_WIDTH}" height="${DOC_HEIGHT}">
  <rect x="0" y="0" width="${HALF_WIDTH}" height="${HALF_HEIGHT}" fill="#ff3333"/>
  <rect x="${HALF_WIDTH}" y="${HALF_HEIGHT}" width="${HALF_WIDTH}" height="${HALF_HEIGHT}" fill="#33ff66"/>
</svg>`;

declareAntialiasingPolicy('aa');

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  expectedImageDescription:
    'An 800x600 opaque black field with two flat rectangles, each 200x150, meeting at a single point: a ' +
    'red one spanning x 200-400, y 150-300, and a green one spanning x 400-600, y 300-450. They occupy ' +
    'diagonally opposite corners of a 400x300 box that runs x 200-600, y 150-450, and the other two ' +
    'corners of that box are empty — near x 500, y 200 and near x 300, y 400 the field is pure black. The ' +
    'diagonal placement is deliberate: a vertical or horizontal flip would move the fill to the other two ' +
    'corners and fail. Both colours are flat, with no gradient, no outline around either rectangle, and ' +
    'nothing drawn outside the two footprints.',
});

const root = createDisplayObject();

// A clean document must import silently. A diagnostic here means the importer dropped or recovered
// something, which would make any later pixel assertion a statement about the fallback, not the import.
const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics);
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-import] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}

imported.x = ORIGIN_X;
imported.y = ORIGIN_Y;
invalidateNodeLocalTransform(imported);
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // Top-left quadrant of the document: the red rect.
  const topLeft = at(ORIGIN_X + HALF_WIDTH / 2, ORIGIN_Y + HALF_HEIGHT / 2);
  if (channel(topLeft, 16) < 150 || channel(topLeft, 8) > 110) {
    throw new Error(`[svg-import] top-left quadrant is not the red rect — got #${hex(topLeft)}`);
  }

  // Bottom-right quadrant: the green rect.
  const bottomRight = at(ORIGIN_X + HALF_WIDTH + HALF_WIDTH / 2, ORIGIN_Y + HALF_HEIGHT + HALF_HEIGHT / 2);
  if (channel(bottomRight, 8) < 150 || channel(bottomRight, 16) > 110) {
    throw new Error(`[svg-import] bottom-right quadrant is not the green rect — got #${hex(bottomRight)}`);
  }

  // The other two quadrants are empty in the document and must stay empty on the canvas — this is what
  // makes the check about placement rather than mere presence.
  const topRight = at(ORIGIN_X + HALF_WIDTH + HALF_WIDTH / 2, ORIGIN_Y + HALF_HEIGHT / 2);
  if (!isBackground(topRight)) {
    throw new Error(`[svg-import] top-right quadrant should be empty — got #${hex(topRight)}`);
  }
  const bottomLeft = at(ORIGIN_X + HALF_WIDTH / 2, ORIGIN_Y + HALF_HEIGHT + HALF_HEIGHT / 2);
  if (!isBackground(bottomLeft)) {
    throw new Error(`[svg-import] bottom-left quadrant should be empty — got #${hex(bottomLeft)}`);
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}
