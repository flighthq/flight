// svg-image — render coverage for the SVG <image> element: that a resolved image resource is drawn, at
// the element's x/y/width/height, and in the correct orientation.
//
// ORIENTATION IS THE POINT, AND IT NEEDS A FOUR-COLOUR SOURCE TO TEST. A single-colour or symmetric
// image renders identically whether it was drawn upright, flipped, or transposed, so a scene using one
// would pass against a V-flip — the classic image-import defect, since bitmap origins differ between
// conventions. The source here is four distinctly-coloured quadrants, and the scene assertion samples all four
// in the destination box, so every one of those transforms produces a different quadrant somewhere and
// fails.
//
// The destination box is a 6x uniform scale of the source, which does two things: it separates "drawn
// at the element's size" from "drawn at the source's size", and it keeps the aspect ratio identical so
// the default preserveAspectRatio has nothing to letterbox. Aspect fitting is a distinct behaviour with
// its own edge cases and belongs to a scene that targets it.
//
// The importer resolves an <image href> through the caller-supplied resolveImageResource hook, so this
// scene provides one and asserts it was actually consulted — an unresolved href reports
// svg.unresolved-image and draws nothing, which the zero-diagnostics check below would catch first.
//
// SCOPE, STATED NARROWLY: one <image> with an explicit x/y/width/height at a uniform scale, resolved
// through the options hook. It says nothing about preserveAspectRatio fitting, images inside a use or
// symbol, clipped or transformed images, or href forms the hook does not serve. Read a pass as "a
// resolved image draws where and how the element says," never as "SVG images are covered."
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createImageResourceFromCanvas,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  ShapeKind,
  SpriteKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// Source image: four quadrants, each a different colour.
const SOURCE_SIZE = 40;
const SOURCE_QUAD = SOURCE_SIZE / 2;

// Destination: a uniform 6x, so aspect is unchanged and nothing letterboxes.
const DEST_SCALE = 6;
const DEST_SIZE = SOURCE_SIZE * DEST_SCALE;
const DEST_X = 180;
const DEST_Y = 90;
const DEST_QUAD = DEST_SIZE / 2;

const IMAGE_HREF = 'quadrants.png';

const SVG_SOURCE = `<svg width="${WIDTH}" height="${HEIGHT}">
  <image href="${IMAGE_HREF}" x="${DEST_X}" y="${DEST_Y}" width="${DEST_SIZE}" height="${DEST_SIZE}"/>
</svg>`;

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind, SpriteKind],
  expectedImageDescription:
    'An 800x600 opaque black field with one 240x240 square spanning x 180-420 and y 90-330, divided into ' +
    'four equal 120x120 quadrants of flat colour: red top-left, green top-right, blue bottom-left, white ' +
    'bottom-right. That exact arrangement is the claim — it distinguishes an upright picture from one ' +
    'flipped vertically (blue and white on top), flipped horizontally (green and white on the left), or ' +
    'transposed (green and blue swapped). The square is six times its source size and stays square, so ' +
    'nothing is letterboxed and no band of background appears inside its box. The quadrants meet at x 300 ' +
    'and y 210 with no blur or gradient across either seam, and outside the square the field is pure ' +
    'black.',
});

const root = createDisplayObject();

let resolvedHref: string | null = null;

// A clean document must import silently. A diagnostic here would mean the importer dropped or recovered
// something — an unresolved href among them — making every pixel assertion a statement about the
// fallback rather than the import.
const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics, {
  resolveImageResource: (href) => {
    resolvedHref = href;
    return createImageResourceFromCanvas(buildQuadrantCanvas());
  },
});
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-image] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}
if (resolvedHref !== IMAGE_HREF) {
  throw new Error(`[svg-image] the importer resolved href ${String(resolvedHref)}, expected ${IMAGE_HREF}`);
}
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));
  // Sampled at the centre of each destination quadrant, well clear of the seams between them.
  const quadrant = (column: number, row: number): number =>
    at(DEST_X + column * DEST_QUAD + DEST_QUAD / 2, DEST_Y + row * DEST_QUAD + DEST_QUAD / 2);

  const topLeft = quadrant(0, 0);
  const topRight = quadrant(1, 0);
  const bottomLeft = quadrant(0, 1);
  const bottomRight = quadrant(1, 1);
  const reading = `TL #${hex(topLeft)}, TR #${hex(topRight)}, BL #${hex(bottomLeft)}, BR #${hex(bottomRight)}`;

  // Each quadrant must carry its own colour. Taken together these pin orientation: a vertical flip
  // swaps the rows, a horizontal flip swaps the columns, and a transpose swaps one diagonal — none of
  // which any single-quadrant check would notice.
  if (!isRed(topLeft)) throw new Error(`[svg-image] top-left quadrant is not red — ${reading}`);
  if (!isGreen(topRight)) throw new Error(`[svg-image] top-right quadrant is not green — ${reading}`);
  if (!isBlue(bottomLeft)) throw new Error(`[svg-image] bottom-left quadrant is not blue — ${reading}`);
  if (!isWhite(bottomRight)) throw new Error(`[svg-image] bottom-right quadrant is not white — ${reading}`);

  // Drawn at the ELEMENT's size, not the source's: just inside the destination edge is still image, and
  // beyond it is background. A source-sized draw would leave the far side of the box empty.
  const nearFarEdge = at(DEST_X + DEST_SIZE - 12, DEST_Y + DEST_SIZE - 12);
  if (!isWhite(nearFarEdge)) {
    throw new Error(
      `[svg-image] the image does not fill its authored box — got #${hex(nearFarEdge)} just inside the ` +
        `far corner, so it was drawn at the source size rather than the element's width/height`,
    );
  }
  const beyond = at(DEST_X + DEST_SIZE + 25, DEST_Y + DEST_SIZE / 2);
  if (!isBackground(beyond)) {
    throw new Error(`[svg-image] the image extends past its authored box — got #${hex(beyond)}`);
  }
}

function buildQuadrantCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SOURCE_SIZE;
  canvas.height = SOURCE_SIZE;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ff0000'; // top-left red
  context.fillRect(0, 0, SOURCE_QUAD, SOURCE_QUAD);
  context.fillStyle = '#00ff00'; // top-right green
  context.fillRect(SOURCE_QUAD, 0, SOURCE_QUAD, SOURCE_QUAD);
  context.fillStyle = '#0000ff'; // bottom-left blue
  context.fillRect(0, SOURCE_QUAD, SOURCE_QUAD, SOURCE_QUAD);
  context.fillStyle = '#ffffff'; // bottom-right white
  context.fillRect(SOURCE_QUAD, SOURCE_QUAD, SOURCE_QUAD, SOURCE_QUAD);
  return canvas;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}

function isBlue(rgb: number): boolean {
  return channel(rgb, 0) > 150 && channel(rgb, 16) < 110 && channel(rgb, 8) < 110;
}

function isGreen(rgb: number): boolean {
  return channel(rgb, 8) > 150 && channel(rgb, 16) < 110 && channel(rgb, 0) < 110;
}

function isRed(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) < 110 && channel(rgb, 0) < 110;
}

function isWhite(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 8) > 150 && channel(rgb, 0) > 150;
}
