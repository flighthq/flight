// svg-clip-path — render coverage for the SVG importer's clip-path attribute: that a referenced
// <clipPath> reaches the rasterizer and actually REMOVES pixels, in both of the importer's unit modes.
//
// The load-bearing assertion is the negative one. A clip that is dropped entirely still draws the whole
// shape, so "something rendered here" passes with clipping completely broken — the only check that can
// tell the two apart is that the region OUTSIDE the clip, but inside the shape it clips, is background.
// Each half of this scene therefore samples a point that must be painted and a point that must not.
//
// The two halves are deliberately opposite: the user-space clip keeps its shape's LEFT half, the
// object-bounding-box clip keeps its shape's RIGHT half. A defect that resolved the clip rectangle but
// placed or mirrored it wrongly would satisfy one and fail the other, where two same-handed clips could
// both survive it.
//
// The second half also covers a genuinely different code path, not just a second fixture:
// clipPathUnits="objectBoundingBox" resolves fractional units against the target's bounds, so its
// rectangle is computed rather than copied.
//
// SCOPE, STATED NARROWLY: rectangular clip geometry referenced by clip-path, in the two unit modes. The
// importer also supports mask (as a hard clip, with its own diagnostic), clips on groups, images and
// use elements, and arbitrary path geometry rather than rectangles — none of which this scene touches.
// Read a pass as "a referenced clipPath removes the pixels it should," never as "SVG clipping is
// covered."
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

const SHAPE_Y = 180;
const SHAPE_WIDTH = 300;
const SHAPE_HEIGHT = 220;
const USER_SPACE_X = 60;
const BOUNDING_BOX_X = 440;
// Sampled well inside each half so antialiasing at the clip edge never decides the result.
const INSET = 70;
const SAMPLE_Y = SHAPE_Y + SHAPE_HEIGHT / 2;

const SVG_SOURCE = `<svg width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <clipPath id="keepLeft">
      <rect x="${USER_SPACE_X}" y="${SHAPE_Y}" width="${SHAPE_WIDTH / 2}" height="${SHAPE_HEIGHT}"/>
    </clipPath>
    <clipPath id="keepRight" clipPathUnits="objectBoundingBox">
      <rect x="0.5" y="0" width="0.5" height="1"/>
    </clipPath>
  </defs>
  <rect x="${USER_SPACE_X}" y="${SHAPE_Y}" width="${SHAPE_WIDTH}" height="${SHAPE_HEIGHT}"
        fill="#33ccff" clip-path="url(#keepLeft)"/>
  <rect x="${BOUNDING_BOX_X}" y="${SHAPE_Y}" width="${SHAPE_WIDTH}" height="${SHAPE_HEIGHT}"
        fill="#33ff66" clip-path="url(#keepRight)"/>
</svg>`;

declareAntialiasingPolicy('aa');

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  // Clipping is an opt-in harness capability. Without it the imported clip regions are still on the
  // nodes but nothing honours them, and the scene reports the importer ignoring clip-path when in fact
  // the target was never asked to clip.
  clip: true,
  expectedImageDescription:
    'An 800x600 opaque black field with two flat rectangles, each 150 wide and 220 tall, at the same ' +
    'height y 180-400: a cyan one spanning x 60-210 and a green one spanning x 590-740. Each is the ' +
    'surviving half of a 300-wide rectangle, and the halves survive on OPPOSITE sides — the cyan one kept ' +
    'its left half, so x 210-360 is pure black, and the green one kept its right half, so x 440-590 is ' +
    'pure black. That opposition is the claim: a picture where both keep the same side, or where either ' +
    'full 300-wide rectangle appears, is wrong. Both colours are flat, with no gradient and no partial ' +
    'fade along the cut edge.',
});

const root = createDisplayObject();

// A clean document must import silently. A diagnostic here would mean the importer dropped or recovered
// something, making every pixel assertion below a statement about the fallback rather than the import.
const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics);
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-clip-path] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // User-space clip: the shape's left half survives.
  const userKept = at(USER_SPACE_X + INSET, SAMPLE_Y);
  if (!isFill(userKept)) {
    throw new Error(`[svg-clip-path] user-space clip removed the half it should have kept — got #${hex(userKept)}`);
  }
  // …and its right half must be gone. Without this, a clip that never applied would pass.
  const userClipped = at(USER_SPACE_X + SHAPE_WIDTH - INSET, SAMPLE_Y);
  if (isFill(userClipped)) {
    throw new Error(
      `[svg-clip-path] the user-space clip did not remove anything — the shape's right half is still ` +
        `painted (got #${hex(userClipped)}), so clip-path is being ignored`,
    );
  }

  // Object-bounding-box clip: fractional units resolved against the target's bounds, keeping the RIGHT
  // half — the opposite hand to the clip above.
  const boxKept = at(BOUNDING_BOX_X + SHAPE_WIDTH - INSET, SAMPLE_Y);
  if (!isFill(boxKept)) {
    throw new Error(
      `[svg-clip-path] objectBoundingBox clip removed the half it should have kept — got #${hex(boxKept)}`,
    );
  }
  const boxClipped = at(BOUNDING_BOX_X + INSET, SAMPLE_Y);
  if (isFill(boxClipped)) {
    throw new Error(
      `[svg-clip-path] the objectBoundingBox clip did not remove anything — the shape's left half is ` +
        `still painted (got #${hex(boxClipped)}), so fractional clip units are not resolving against ` +
        `the target's bounds`,
    );
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isFill(rgb: number): boolean {
  return channel(rgb, 16) > 90 || channel(rgb, 8) > 90 || channel(rgb, 0) > 90;
}
